// Testes da posse dos buffers emprestados (ADR-0692, item 5).
//
// O `GeometryRegistry` e a `AlphaClipTable` seguram uma referencia de cada
// buffer que guardam. Aqui o `AddRef`/`Release` e falso e CONTA as chamadas por
// handle: sem GPU, o que se verifica e o saldo — quem guardou soltou, e quem
// soltou nao soltou duas vezes.
#include <map>

#include "../src/render/alpha_clip_table.h"
#include "../src/render/geometry_registry.h"
#include "harness.h"

namespace {

/** Saldo de referencias por handle falso (AddRef soma, Release subtrai). */
std::map<uintptr_t, int> g_saldo;
/** Quantos objetos de recorte (view/bind group) foram soltos. */
int g_objetosSoltos = 0;

void addRefFalso(WGPUBuffer b) { g_saldo[reinterpret_cast<uintptr_t>(b)] += 1; }
void releaseFalso(WGPUBuffer b) { g_saldo[reinterpret_cast<uintptr_t>(b)] -= 1; }
void soltarGrupoFalso(WGPUBindGroup) { g_objetosSoltos += 1; }
void soltarViewFalsa(WGPUTextureView) { g_objetosSoltos += 1; }

const render::BufferRefOps kOpsContadas{addRefFalso, releaseFalso};

void zerar() {
  g_saldo.clear();
  g_objetosSoltos = 0;
}

int saldo(uintptr_t handle) {
  const auto it = g_saldo.find(handle);
  return it == g_saldo.end() ? 0 : it->second;
}

WGPUBuffer buffer(uintptr_t valor) { return reinterpret_cast<WGPUBuffer>(valor); }

/** Handles falsos dos testes. */
constexpr uintptr_t kVertA = 0x10;
constexpr uintptr_t kIndA = 0x20;
constexpr uintptr_t kVertB = 0x30;
constexpr uintptr_t kIndB = 0x40;
constexpr uintptr_t kUvA = 0x50;
constexpr uintptr_t kUvB = 0x60;
constexpr uintptr_t kGrupo = 0x70;
constexpr uintptr_t kView = 0x80;
constexpr uint32_t kIndices = 36;
/** Bytes entre UVs densos (dois float32). */
constexpr uint32_t kUvDenso = 8;
constexpr uint32_t kIdA = 1;
constexpr uint32_t kIdB = 2;
constexpr int32_t kNo = 4;
constexpr int32_t kOutroNo = 5;

render::GeometryEntry indexada(uintptr_t vertice, uintptr_t indice) {
  render::GeometryEntry e;
  e.vertexBuffer = buffer(vertice);
  e.indexBuffer = buffer(indice);
  e.indexCount = kIndices;
  return e;
}

render::AlphaClipEntry recorte(uintptr_t uv, bool comObjetos) {
  render::AlphaClipEntry e;
  e.uvBuffer = buffer(uv);
  e.uvStride = kUvDenso;
  if (comObjetos) {
    e.bindGroup = reinterpret_cast<WGPUBindGroup>(kGrupo);
    e.view = reinterpret_cast<WGPUTextureView>(kView);
  }
  return e;
}

render::AlphaClipReleaseOps opsDoRecorte() {
  render::AlphaClipReleaseOps ops;
  ops.buffers = kOpsContadas;
  ops.releaseBindGroup = soltarGrupoFalso;
  ops.releaseView = soltarViewFalsa;
  return ops;
}

}  // namespace

namespace tests {

void testGeometryRegistrySeguraESoltaAoSobrescrever() {
  zerar();
  render::GeometryRegistry reg{kOpsContadas};
  CHECK(reg.set(kIdA, indexada(kVertA, kIndA)));
  CHECK(saldo(kVertA) == 1);
  CHECK(saldo(kIndA) == 1);

  // O MESMO buffer de novo no mesmo id: nao acumula e nunca zera no meio.
  CHECK(reg.set(kIdA, indexada(kVertA, kIndA)));
  CHECK(saldo(kVertA) == 1);
  CHECK(saldo(kIndA) == 1);

  // Buffers novos no mesmo id: os antigos sao soltos.
  CHECK(reg.set(kIdA, indexada(kVertB, kIndB)));
  CHECK(saldo(kVertA) == 0);
  CHECK(saldo(kIndA) == 0);
  CHECK(saldo(kVertB) == 1);
  CHECK(saldo(kIndB) == 1);

  // Registro recusado (sem vertice) tira a entrada antiga e solta o que ela segurava.
  render::GeometryEntry semVertice = indexada(0, kIndA);
  CHECK(!reg.set(kIdA, semVertice));
  CHECK(reg.find(kIdA) == nullptr);
  CHECK(saldo(kVertB) == 0);
  CHECK(saldo(kIndB) == 0);
  CHECK(saldo(kIndA) == 0);
}

void testGeometryRegistryEraseEClearSoltam() {
  zerar();
  render::GeometryRegistry reg{kOpsContadas};
  CHECK(reg.set(kIdA, indexada(kVertA, kIndA)));
  // Nao indexada: so o buffer de vertice e segurado.
  render::GeometryEntry direta;
  direta.vertexBuffer = buffer(kVertB);
  direta.vertexCount = 3;
  CHECK(reg.set(kIdB, direta));
  CHECK(saldo(kVertB) == 1);

  reg.erase(kIdA);
  CHECK(saldo(kVertA) == 0);
  CHECK(saldo(kIndA) == 0);
  reg.erase(kIdA);  // id que ja saiu: nao solta de novo
  CHECK(saldo(kVertA) == 0);

  reg.clear();
  CHECK(saldo(kVertB) == 0);
  CHECK(reg.size() == 0);
}

void testGeometryRegistryMarcaPosicaoForaDeFloat32x3() {
  zerar();
  render::GeometryRegistry reg{kOpsContadas};
  CHECK(reg.set(kIdA, indexada(kVertA, kIndA)));
  CHECK(!reg.positionRefused(kIdA));

  // Formato errado: nada guardado, o antigo solto, e o id fica marcado.
  render::GeometryEntry torta = indexada(kVertB, kIndB);
  torta.positionIsFloat32x3 = false;
  CHECK(!reg.set(kIdA, torta));
  CHECK(reg.find(kIdA) == nullptr);
  CHECK(reg.positionRefused(kIdA));
  CHECK(saldo(kVertA) == 0);
  CHECK(saldo(kVertB) == 0);

  // Registrar de novo com formato valido tira a marca.
  CHECK(reg.set(kIdA, indexada(kVertA, kIndA)));
  CHECK(!reg.positionRefused(kIdA));

  // erase e clear tambem esquecem a marca.
  CHECK(!reg.set(kIdB, torta));
  CHECK(reg.positionRefused(kIdB));
  reg.erase(kIdB);
  CHECK(!reg.positionRefused(kIdB));
  CHECK(!reg.set(kIdB, torta));
  reg.clear();
  CHECK(!reg.positionRefused(kIdB));
  CHECK(saldo(kVertA) == 0);
}

void testAlphaClipTableSeguraOUvESoltaTudo() {
  zerar();
  render::AlphaClipTable tabela{opsDoRecorte()};
  tabela.put(kNo, recorte(kUvA, true));
  CHECK(saldo(kUvA) == 1);
  CHECK(tabela.find(kNo) != nullptr);

  // Trocar o recorte do no solta o UV antigo e os objetos da entrada antiga.
  tabela.put(kNo, recorte(kUvB, false));
  CHECK(saldo(kUvA) == 0);
  CHECK(saldo(kUvB) == 1);
  CHECK(g_objetosSoltos == 2);

  tabela.erase(kNo);
  CHECK(saldo(kUvB) == 0);
  CHECK(tabela.find(kNo) == nullptr);

  // eraseIf (slot virou lapide) e clear soltam o que sobrou.
  tabela.put(kNo, recorte(kUvA, false));
  tabela.put(kOutroNo, recorte(kUvB, false));
  tabela.eraseIf([](int32_t no) { return no == kNo; });
  CHECK(saldo(kUvA) == 0);
  CHECK(saldo(kUvB) == 1);
  tabela.clear();
  CHECK(saldo(kUvB) == 0);
  CHECK(tabela.size() == 0);
}

}  // namespace tests
