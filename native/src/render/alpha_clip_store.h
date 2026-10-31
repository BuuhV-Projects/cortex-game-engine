// Recorte alfa dos casters de sombra, por nó do espelho (SPEC-0642).
//
// O `three` recorta a sombra de um material com `alphaTest` pela textura: amostra
// `map.a` no UV transformado por `map.matrix` e descarta o fragmento quando
// `a <= alphaTest`. Para o passe nativo fazer o mesmo, o host precisa da textura,
// do buffer de UV e desses dois números — é o que este store guarda.
//
// Textura e buffer de UV são EMPRESTADOS do `three` (como no `GeometryRegistry`):
// quem os cria e destrói é ele, e o JS apaga a entrada no quadro em que o handle
// some (o `destroy` do host é adiado em 10 quadros, ADR-0153). O store é dono só do
// que cria: a `TextureView`, os samplers e o bind group do grupo 1 do pipeline.
#pragma once

#include <cstdint>
#include <unordered_map>

#include <webgpu/webgpu.h>

struct HostGpu;

namespace render {

/** Floats da `map.matrix` do `three` (`Matrix3`, coluna-maior). */
constexpr uint32_t kUvTransformFloats = 9;

/** Modo de repetição do sampler, na ordem do índice da tabela de samplers. */
enum class AlphaClipWrap : uint8_t { kRepeat = 0, kClamp = 1, kMirror = 2 };
/** Quantos modos de repetição existem (lado da tabela de samplers). */
constexpr uint32_t kAlphaClipWrapCount = 3;

/**
 * Converte a constante de `wrapS`/`wrapT` do `three` (`RepeatWrapping` = 1000,
 * `ClampToEdgeWrapping` = 1001, `MirroredRepeatWrapping` = 1002). Devolve `false`
 * para valor fora da tabela — e aí o recorte não é registrado (recusa).
 */
bool alphaClipWrapFromThree(double value, AlphaClipWrap* out);

/** `true` quando o formato pode ser amostrado com filtro linear (textura de cor). */
bool alphaClipFilterableFormat(WGPUTextureFormat format);

/** O que o JS manda para um nó. */
struct AlphaClipSource {
  WGPUTexture texture = nullptr;
  WGPUBuffer uvBuffer = nullptr;
  /** Bytes entre UVs consecutivos (8 denso; o passo do bloco quando interleaved). */
  uint32_t uvStride = 0;
  /** Bytes do início do buffer até o primeiro UV. */
  uint64_t uvOffset = 0;
  float alphaTest = 0.0f;
  AlphaClipWrap wrapS = AlphaClipWrap::kRepeat;
  AlphaClipWrap wrapT = AlphaClipWrap::kRepeat;
  float uvTransform[kUvTransformFloats] = {};
};

/** O recorte de um nó, pronto para o passe. */
struct AlphaClipEntry {
  WGPUBuffer uvBuffer = nullptr;
  uint32_t uvStride = 0;
  uint64_t uvOffset = 0;
  float alphaTest = 0.0f;
  float uvTransform[kUvTransformFloats] = {};
  /** Grupo 1 do pipeline com recorte: textura + sampler. Dono: o store. */
  WGPUBindGroup bindGroup = nullptr;
  WGPUTextureView view = nullptr;
};

/** Nó do espelho → recorte alfa. */
class AlphaClipStore {
 public:
  /**
   * Guarda (ou troca) o recorte do nó. Devolve `false` quando a fonte não serve
   * (textura que não é 2D simples, formato não filtrável, sem UV) ou a GPU recusa
   * algum recurso — o nó fica SEM recorte e o gate recusa o quadro.
   */
  bool set(HostGpu* gpu, int32_t node, const AlphaClipSource& source);

  /** O recorte do nó, ou `nullptr` se o host não o tem. */
  const AlphaClipEntry* find(int32_t node) const;

  void erase(int32_t node);

  /** Libera os nós para os quais `removed(node)` é verdadeiro (slot virou lápide). */
  template <typename Removed>
  void eraseIf(Removed removed) {
    for (auto it = entries_.begin(); it != entries_.end();) {
      if (removed(it->first)) {
        release(it->second);
        it = entries_.erase(it);
      } else {
        ++it;
      }
    }
  }

  /** Esquece tudo (espelho reconstruído). */
  void clear();

  /** Layout do grupo 1 (textura + sampler, visível no fragmento); criado na 1ª vez. */
  WGPUBindGroupLayout layout(HostGpu* gpu);

 private:
  static void release(AlphaClipEntry& entry);
  WGPUSampler sampler(HostGpu* gpu, AlphaClipWrap wrapS, AlphaClipWrap wrapT);

  std::unordered_map<int32_t, AlphaClipEntry> entries_;
  WGPUBindGroupLayout layout_ = nullptr;
  WGPUSampler samplers_[kAlphaClipWrapCount][kAlphaClipWrapCount] = {};
};

/** O store do processo (um runtime, uma cena), como o `geometryRegistry()`. */
AlphaClipStore& alphaClipStore();

}  // namespace render
