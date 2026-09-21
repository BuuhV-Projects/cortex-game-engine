// Pool de uniformes por objeto (M3 do ADR-0237 / SPEC-0239).
//
// Um buffer grande em slots alinhados, com UM bind group para todos e offset
// dinâmico por objeto. O `three` cria um bind group por objeto, e isso está
// dentro dos 33,5 us por draw medidos na SPEC-0227.
//
// O ponto do desenho é o que NÃO se escreve: cada objeto tem slot fixo, então
// quem não se moveu mantém o conteúdo do frame anterior e não gera
// `writeBuffer` nenhum. A SPEC-0225 mediu que os uniformes de objeto parado não
// dependem da câmera — reescrevê-los todo frame é trabalho jogado fora.
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace render {

/** Alinhamento exigido pelo WebGPU para offset dinâmico de uniform buffer. */
constexpr uint64_t kUniformSlotAlign = 256;

/** Slot inválido — devolvido quando o objeto ainda não tem slot. */
constexpr int32_t kNoSlot = -1;

/**
 * Distribui slots de uniforme e decide, a cada frame, quais precisam ir para a
 * GPU.
 *
 * Não fala com o wgpu: quem escreve é o chamador, usando {@link pendingWrites}.
 * É o que mantém a política testável sem device — e a política é o marco.
 */
class UniformPool {
 public:
  /** Prepara o pool para `objectCount` objetos. Idempotente para o mesmo número. */
  void resize(size_t objectCount);

  /** Offset em bytes do slot de um objeto, para o bind group dinâmico. */
  uint64_t offsetOf(int32_t slot) const {
    return static_cast<uint64_t>(slot) * kUniformSlotAlign;
  }

  /** Bytes que o buffer precisa ter. */
  uint64_t byteSize() const { return static_cast<uint64_t>(slots_) * kUniformSlotAlign; }

  size_t slotCount() const { return slots_; }

  /**
   * Marca que o objeto mudou e precisa ir para a GPU neste frame.
   *
   * Marcar duas vezes no mesmo frame não gera duas escritas: a segunda é
   * ignorada. Sem isso, um objeto tocado por dois sistemas custaria dobrado.
   */
  void markDirty(int32_t slot);

  /** Slots a escrever neste frame, na ordem em que foram marcados. */
  const std::vector<int32_t>& pendingWrites() const { return pending_; }

  /** Fecha o frame: o que foi escrito deixa de estar pendente. */
  void clearPending();

  /** Marca todos — troca de cena, recriação de buffer. */
  void markAllDirty();

 private:
  size_t slots_ = 0;
  std::vector<uint8_t> dirty_;
  std::vector<int32_t> pending_;
};

}  // namespace render
