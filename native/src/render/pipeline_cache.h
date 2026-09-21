// Cache de pipeline por chave (M2 do ADR-0237 / SPEC-0238).
//
// Um `WGPURenderPipeline` compila shader no driver: criar um por frame é o que
// este cache existe para impedir. O critério do marco é literal — **nenhum
// pipeline criado por frame em regime**.
//
// A chave vem pronta do lado JS (`src/render/PipelineKey.ts`) e carrega só o
// que muda o pipeline: modelo de sombreamento, blend, cull, tone mapping,
// presença de textura, layout de vértice e formato do alvo. Cor, opacidade,
// metálico e espessura de contorno **não estão aqui** — são uniforms, e botá-los
// na chave criaria um pipeline por instância de cor.
//
// Medido na cena do kart-racer: 242 materiais descritos geram **5 chaves
// distintas**.
#pragma once

#include <cstdint>
#include <functional>
#include <unordered_map>

namespace render {

/** Chave empacotada; o layout de bits é contrato com `PipelineKey.ts`. */
using PipelineKey = uint64_t;

/**
 * Cache genérico sobre o handle de pipeline.
 *
 * O tipo do handle é parâmetro para o cache ser testável **sem device**: o
 * harness do host não tem GPU, então o teste usa um handle falso e exercita a
 * lógica de acerto/erro, que é onde o critério do marco vive.
 */
template <typename Pipeline>
class PipelineCache {
 public:
  /** Cria sob demanda, ou devolve o que já existe. */
  Pipeline getOrCreate(PipelineKey key, const std::function<Pipeline()>& create) {
    const auto found = entries_.find(key);
    if (found != entries_.end()) {
      hits_++;
      return found->second;
    }
    Pipeline pipeline = create();
    entries_.emplace(key, pipeline);
    misses_++;
    return pipeline;
  }

  /** Quantos pipelines existem — deve estabilizar no número de chaves distintas. */
  size_t size() const { return entries_.size(); }
  /** Reaproveitamentos desde o último `resetCounters`. */
  uint64_t hits() const { return hits_; }
  /**
   * Criações desde o último `resetCounters`. É **este** número que precisa ser
   * zero em regime: se crescer por frame, o cache não está cumprindo o marco.
   */
  uint64_t misses() const { return misses_; }

  void resetCounters() {
    hits_ = 0;
    misses_ = 0;
  }

  /** Esvazia o cache (troca de cena). Quem destrói os handles é o dono deles. */
  void clear() { entries_.clear(); }

 private:
  std::unordered_map<PipelineKey, Pipeline> entries_;
  uint64_t hits_ = 0;
  uint64_t misses_ = 0;
};

}  // namespace render
