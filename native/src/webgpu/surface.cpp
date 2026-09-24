// surface — o "canvas" do host: gpuContext.configure/getCurrentTexture e o
// present do frame. A textura da surface é NÃO-own do lado JS: quem
// apresenta e libera é o host (presentIfAcquired), uma vez por frame.

#include "../napi/napi_util.h"
#include "bindings.h"
#include "enums.h"
#include "../core/crash_handler.h"
#include "internal.h"
#include "gpu_latency.h"
#include "../core/app_window.h"
#include "supersample.h"
#include "render_parity_capture.h"

#include <webgpu/wgpu.h>

#include <cstdio>

namespace webgpu {
namespace {

bool isSurfaceTextureUsable(const WGPUSurfaceTexture& st) {
  return st.status == WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal ||
         st.status == WGPUSurfaceGetCurrentTextureStatus_SuccessSuboptimal;
}

// Reconfigura a surface pro tamanho corrente. SÓ é chamado do caminho de
// aquisição (getCurrentTexture), onde NENHUMA textura da surface está viva —
// é o único ponto seguro (configurar com textura adquirida = "Invalid
// surface" e crash do wgpu).
// Configura a surface. Nas RECUPERAÇÕES (Outdated/Lost) usa o tamanho já
// validado — reconfigurar a mesma surface pra um tamanho DIFERENTE é que dá
// "Invalid surface"; mudança de tamanho passa por recreateSurface (SPEC-0199).
/**
 * O modo de apresentacao, com `Fifo` como padrao (SPEC-0255).
 *
 * `CORTEX_PRESENT_MODE=mailbox|immediate|fifo` troca em tempo de execucao, para
 * responder uma pergunta medida: um frame leva ate 321 ms para ficar pronto
 * enquanto a GPU executa 0,60 ms de trabalho (SPEC-0254). O tempo e ESPERA, e
 * a swapchain e o suspeito que sobrou.
 *
 * Um modo que o dispositivo nao suporta faz o `configure` falhar, entao a
 * escolha so vale se a surface declarar que o tem — e o que ficou valendo vai
 * para o log, porque medir com o modo errado sem saber e pior que nao medir.
 */
WGPUPresentMode escolherPresentMode(HostGpu* gpu) {
  const char* pedido = SDL_getenv("CORTEX_PRESENT_MODE");
  if (pedido == nullptr) return WGPUPresentMode_Fifo;
  WGPUPresentMode alvo = WGPUPresentMode_Fifo;
  if (SDL_strcasecmp(pedido, "mailbox") == 0) alvo = WGPUPresentMode_Mailbox;
  else if (SDL_strcasecmp(pedido, "immediate") == 0) alvo = WGPUPresentMode_Immediate;
  else if (SDL_strcasecmp(pedido, "fifo") != 0) {
    core::appendPerfLog("present-mode: valor desconhecido '%s' — usando Fifo", pedido);
    return WGPUPresentMode_Fifo;
  }
  if (alvo == WGPUPresentMode_Fifo) return alvo;
  WGPUSurfaceCapabilities caps = WGPU_SURFACE_CAPABILITIES_INIT;
  bool suportado = false;
  if (wgpuSurfaceGetCapabilities(gpu->surface, gpu->adapter, &caps) == WGPUStatus_Success) {
    for (size_t i = 0; i < caps.presentModeCount; ++i) {
      if (caps.presentModes[i] == alvo) { suportado = true; break; }
    }
    wgpuSurfaceCapabilitiesFreeMembers(caps);
  }
  if (!suportado) {
    core::appendPerfLog("present-mode: %s NAO suportado pela surface — usando Fifo", pedido);
    return WGPUPresentMode_Fifo;
  }
  core::appendPerfLog("present-mode: %s", pedido);
  return alvo;
}

void configureSurface(HostGpu* gpu, int w, int h) {
  gpu->config = WGPU_SURFACE_CONFIGURATION_INIT;
  gpu->config.device = gpu->device;
  gpu->config.format = gpu->requestedFormat;
  gpu->config.width = static_cast<uint32_t>(w);
  gpu->config.height = static_cast<uint32_t>(h);
  gpu->config.presentMode = escolherPresentMode(gpu);
  // Paridade visual (SPEC-0240, passo 1): com CORTEX_RENDER_PARITY_CAPTURE
  // ligado, o comparador precisa ler a `swap` já composta antes do present, o
  // que exige CopySrc no usage. Só pede a flag extra quando o modo está
  // ativo — nenhum outro caminho muda (produção/dev seguem só RenderAttachment).
  gpu->config.usage = WGPUTextureUsage_RenderAttachment;
  if (renderParityCaptureEnabled()) {
    gpu->config.usage |= WGPUTextureUsage_CopySrc;
  }
  wgpuSurfaceConfigure(gpu->surface, &gpu->config);
  gpu->configuredWidth = w;
  gpu->configuredHeight = h;
}

// Ponto único de present (SPEC-0240, passo 1): captura a `swap` já composta
// (se o modo de paridade estiver ligado) e SÓ DEPOIS apresenta — capturar
// depois do present leria uma textura já reciclada pela surface. Reusado
// pelos três caminhos de presentIfAcquired (compositor de UI, SSAA sem
// compositor, caminho antigo sem SSAA) em vez de repetir a chamada em cada um.
void captureThenPresent(HostGpu* gpu, WGPUTexture swap) {
  if (renderParityCaptureEnabled()) maybeCaptureFrame(gpu, swap);
  // Marca o frame ANTES do present: daqui até a GPU avisar que terminou é a
  // latência que a SPEC-0253 mede. Todo o trabalho do frame já foi submetido
  // neste ponto — o blit para a swapchain é o último.
  trackSubmittedFrame(gpu->queue);
  wgpuSurfacePresent(gpu->surface);
}

}  // namespace

// Adquire a textura do frame. 1ª vez: configura com o tamanho da janela.
// Recuperação (Outdated/Lost): reconfigura pro MESMO tamanho já validado.
// Linkage externo (declarada em internal.h): a splash também apresenta um frame.
WGPUTexture acquireSurfaceTexture(HostGpu* gpu) {
  if (gpu->width <= 0 || gpu->height <= 0) return nullptr;  // minimizada
  // RESIZE (SPEC-0199): a janela mudou de tamanho desde a última configuração.
  // Aqui é o ponto seguro — nenhuma textura de surface viva. Reconfigurar a
  // MESMA surface com tamanho novo dá "Invalid surface" e crasha o
  // wgpu-native/D3D12; recriar a partir do HWND funciona.
  const bool sizeChanged = gpu->configuredWidth != 0 &&
                           (gpu->width != gpu->configuredWidth ||
                            gpu->height != gpu->configuredHeight);
  if (sizeChanged || gpu->wantConfigure) {
    gpu->wantConfigure = false;
    if (sizeChanged) core::recreateSurface(gpu);
  }
  if (gpu->configuredWidth == 0) configureSurface(gpu, gpu->width, gpu->height);

  WGPUSurfaceTexture st = WGPU_SURFACE_TEXTURE_INIT;
  wgpuSurfaceGetCurrentTexture(gpu->surface, &st);
  if (!isSurfaceTextureUsable(st)) {
    if (st.texture) wgpuTextureRelease(st.texture);
    // Recupera com o tamanho JÁ configurado (nunca um novo → sem crash).
    configureSurface(gpu, gpu->configuredWidth, gpu->configuredHeight);
    wgpuSurfaceGetCurrentTexture(gpu->surface, &st);
    if (!isSurfaceTextureUsable(st)) {
      if (st.texture) wgpuTextureRelease(st.texture);
      return nullptr;
    }
  }
  return st.texture;
}

// JS/engine chama configure — aqui só REGISTRAMOS a intenção (formato +
// pendência). A reconfiguração real é no ensureSurfaceConfigured, no início
// do frame, sem textura adquirida.
napi_value contextConfigure(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (!gpu || !gpu->device || argc < 1) {
    njs::throwError(env, "configure: device ausente");
    return njs::undefined(env);
  }
  // Só registra o formato + marca "configurada". A configuração REAL da
  // surface acontece no acquireSurfaceTexture (getCurrentTexture), o único
  // ponto sem textura viva — configurar aqui, no meio do frame, dava
  // "Invalid surface" no resize.
  std::string format = njs::getNamedString(env, args[0], "format", "");
  gpu->requestedFormat =
      format.empty() ? gpu->preferredFormat : formatFromString(format);
  gpu->configured = true;
  return njs::undefined(env);
}

napi_value contextGetCurrentTexture(napi_env env, napi_callback_info) {
  HostGpu* gpu = gpuState();
  if (!gpu || !gpu->configured) {
    njs::throwError(env, "getCurrentTexture: surface não configurada");
    return njs::undefined(env);
  }
  // SSAA: o JS desenha no OFFSCREEN (maior); o host faz downscale no present.
  WGPUTextureView offscreen = ensureOffscreen(gpu);
  if (offscreen) {
    // Marca que o JS renderizou ESTE frame — o present só blita quando há um
    // frame novo (senão o vsync travaria o host mesmo sem render, serializando
    // carga assíncrona; ver ssaaPending em host_gpu.h).
    gpu->ssaaPending = true;
    // Não-own: a textura offscreen vive no HostGpu. Devolve os métodos de
    // view (createView etc.) sobre a textura offscreen.
    napi_value obj =
        njs::wrapHandle(env, gpu->offscreenTexture, njs::finalizeNoop);
    return makeTextureViewMethods(env, obj);
  }

  if (!gpu->currentTexture) gpu->currentTexture = acquireSurfaceTexture(gpu);
  if (!gpu->currentTexture) {
    // Surface temporariamente inválida (meio de um resize) — devolve null;
    // o JS pula o frame em vez de crashar.
    napi_value nullValue = nullptr;
    napi_get_null(env, &nullValue);
    return nullValue;
  }

  // Não-own: o host apresenta e libera no fim do frame. Métodos de view
  // vêm do textures.cpp (createView com/sem descriptor).
  napi_value obj = njs::wrapHandle(env, gpu->currentTexture, njs::finalizeNoop);
  return makeTextureViewMethods(env, obj);
}

bool presentIfAcquired(HostGpu* gpu) {
  // ── Composição da UI em gama (ADR-0105) ──────────────────────────────────
  // Apresenta quando o jogo renderizou (ssaaPending) OU a UI foi submetida
  // (uiPending) — as telas de MENU rodam um loop só-UI, sem render do jogo.
  // Compõe SEMPRE via offscreen: com frame do jogo, a UI vai POR CIMA dele; sem
  // (menu), limpa o offscreen e desenha só a UI. Sem UI nem jogo → não apresenta
  // (não trava o vsync em loads pesados que renderizam pouco).
  // Gate por `device` (não `configured`): nas telas de MENU o three renderiza só
  // na RT da UI e NUNCA na canvas, então `context.configure` do JS pode não ter
  // rodado. `acquireSurfaceTexture` auto-configura a surface na 1ª aquisição.
  if (gpu->uiCompositor && gpu->device) {
    // Bloom HDR (ADR-0149): o jogo entrega a cena por `sceneHdrPending` (RT
    // própria), não pelo offscreen (ssaaPending). Qualquer um dispara o present.
    const bool gameRendered = gpu->ssaaPending || gpu->sceneHdrPending;
    if (!gameRendered && !gpu->uiPending) return false;  // nada novo
    // O offscreen só é a base quando NÃO há cena HDR (a HDR já é a fonte do blit).
    if (!gpu->sceneHdrPending) {
      WGPUTextureView off = ensureOffscreen(gpu);
      if (!off) {
        gpu->ssaaPending = false;
        gpu->uiPending = false;
        return false;
      }
      if (!gameRendered) clearOffscreen(gpu);  // menu: base limpa (jogo não desenhou)
    }
    gpu->ssaaPending = false;
    gpu->sceneHdrPending = false;
    gpu->uiPending = false;
    // Transição do render DIRETO (renderScale=1 antes do compositor de UI
    // nascer): o JS pode ter adquirido a swapchain neste mesmo frame
    // (currentTexture). Adquirir DE NOVO panica o wgpu ("Surface image is
    // already acquired") — reusa a textura já adquirida como alvo do blit
    // (1 frame de transição; do próximo em diante o offscreen assume).
    WGPUTexture swap = gpu->currentTexture ? gpu->currentTexture : acquireSurfaceTexture(gpu);
    gpu->currentTexture = nullptr;
    if (!swap) return false;  // surface temporariamente indisponível → pula frame
    WGPUTextureView swapView = wgpuTextureCreateView(swap, nullptr);
    blitToSwapchain(gpu, swapView);  // downscale + compõe a UI em gama
    wgpuTextureViewRelease(swapView);
    captureThenPresent(gpu, swap);
    wgpuTextureRelease(swap);
    return true;
  }

  // ── SSAA sem compositor de UI (host antigo / sem UI de runtime) ───────────
  if (gpu->offscreenView && gpu->configured) {
    if (!gpu->ssaaPending) return false;  // sem frame novo → não bloqueia no vsync
    gpu->ssaaPending = false;
    // Mesma proteção da transição do render direto (ver acima).
    WGPUTexture swap = gpu->currentTexture ? gpu->currentTexture : acquireSurfaceTexture(gpu);
    gpu->currentTexture = nullptr;
    if (!swap) return false;
    WGPUTextureView swapView = wgpuTextureCreateView(swap, nullptr);
    blitToSwapchain(gpu, swapView);
    wgpuTextureViewRelease(swapView);
    captureThenPresent(gpu, swap);
    wgpuTextureRelease(swap);
    return true;
  }
  if (!gpu->currentTexture) return false;
  captureThenPresent(gpu, gpu->currentTexture);
  wgpuTextureRelease(gpu->currentTexture);
  gpu->currentTexture = nullptr;
  return true;
}

}  // namespace webgpu
