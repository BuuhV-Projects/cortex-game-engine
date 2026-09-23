// Ver scene_mirror.h (SPEC-0233).
#include "scene_mirror.h"

#include <cstdio>
#include <cstring>

namespace scene {
namespace {

/** compose() do three: quaternion + posição + escala numa matriz 4x4. */
void compose(double* m, const Transform& t) {
  const double x2 = t.qx + t.qx, y2 = t.qy + t.qy, z2 = t.qz + t.qz;
  const double xx = t.qx * x2, xy = t.qx * y2, xz = t.qx * z2;
  const double yy = t.qy * y2, yz = t.qy * z2, zz = t.qz * z2;
  const double wx = t.qw * x2, wy = t.qw * y2, wz = t.qw * z2;
  m[0] = (1 - (yy + zz)) * t.sx;
  m[1] = (xy + wz) * t.sx;
  m[2] = (xz - wy) * t.sx;
  m[3] = 0;
  m[4] = (xy - wz) * t.sy;
  m[5] = (1 - (xx + zz)) * t.sy;
  m[6] = (yz + wx) * t.sy;
  m[7] = 0;
  m[8] = (xz + wy) * t.sz;
  m[9] = (yz - wx) * t.sz;
  m[10] = (1 - (xx + yy)) * t.sz;
  m[11] = 0;
  m[12] = t.px;
  m[13] = t.py;
  m[14] = t.pz;
  m[15] = 1;
}

/** multiplyMatrices() do three: out = a × b (coluna-maior). */
void multiply(double* out, const double* a, const double* b) {
  for (int i = 0; i < 4; i++) {
    const double a0 = a[i], a1 = a[i + 4], a2 = a[i + 8], a3 = a[i + 12];
    out[i] = a0 * b[0] + a1 * b[1] + a2 * b[2] + a3 * b[3];
    out[i + 4] = a0 * b[4] + a1 * b[5] + a2 * b[6] + a3 * b[7];
    out[i + 8] = a0 * b[8] + a1 * b[9] + a2 * b[10] + a3 * b[11];
    out[i + 12] = a0 * b[12] + a1 * b[13] + a2 * b[14] + a3 * b[15];
  }
}

/** Esfera (centro + raio) contra os 6 planos. */
bool insideFrustum(const float* planes, double x, double y, double z, float radius) {
  for (int i = 0; i < kFrustumPlanes; i++) {
    const int p = i * 4;
    const double d = planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3];
    if (d < -radius) return false;
  }
  return true;
}

}  // namespace

bool SceneMirror::build(const std::vector<NodeDesc>& nodes, size_t spareNodes) {
  const size_t count = nodes.size();
  // A RESERVA VEM ANTES de qualquer resize: é ela que garante que o append de
  // um nó novo não realoca, e portanto que os `subarray` já entregues ao JS
  // continuam apontando para memória viva (ver kMirrorSpareNodes).
  capacity_ = count + spareNodes;
  parents_.reserve(capacity_);
  locals_.reserve(capacity_);
  radii_.reserve(capacity_);
  visibleFlags_.reserve(capacity_);
  materialVisibleFlags_.reserve(capacity_);
  shadowSides_.reserve(capacity_);
  flags_.reserve(capacity_);
  geometryIds_.reserve(capacity_);
  bounds_.reserve(capacity_);
  removed_.reserve(capacity_);
  dirty_.reserve(capacity_);
  local_.reserve(capacity_ * kMatrixFloats);
  world_.reserve(capacity_ * kMatrixFloats);
  freeSlots_.clear();
  liveCount_ = count;

  removed_.assign(count, 0);
  parents_.resize(count);
  locals_.resize(count);
  radii_.resize(count);
  visibleFlags_.resize(count);
  materialVisibleFlags_.resize(count);
  shadowSides_.resize(count);
  flags_.resize(count);
  geometryIds_.resize(count);
  bounds_.resize(count);
  local_.assign(count * kMatrixFloats, 0.0);
  world_.assign(count * kMatrixFloats, 0.0);
  dirty_.assign(count, 1);
  visible_.clear();
  visible_.reserve(capacity_);
  changed_.reserve(capacity_);

  for (size_t i = 0; i < count; i++) {
    const NodeDesc& node = nodes[i];
    // Contrato de ordem: pai antes de filho. Sem isto a propagação linear leria
    // a matriz de mundo do pai ainda não calculada — matriz errada em silêncio,
    // que é o pior modo de falhar.
    if (node.parent >= static_cast<NodeIndex>(i)) return false;
    if (node.parent < kNoParent) return false;
    parents_[i] = node.parent;
    locals_[i] = node.transform;
    radii_[i] = node.radius;
    visibleFlags_[i] = node.visible ? 1 : 0;
    materialVisibleFlags_[i] = node.materialVisible ? 1 : 0;
    shadowSides_[i] = node.shadowSide;
    flags_[i] = node.flags;
    geometryIds_[i] = node.geometryId;
    bounds_[i] = node.bounds;
  }
  return true;
}

NodeIndex SceneMirror::takeSlot(NodeIndex parent) {
  // Um slot de lápide só serve se vier DEPOIS do pai: o contrato
  // pai-antes-de-filho é o que deixa a propagação ser um laço linear, e
  // quebrá-lo daria matriz de mundo errada em silêncio. Entre os que servem,
  // o menor — assim a cena não fica cheia de buracos.
  size_t escolha = freeSlots_.size();
  for (size_t k = 0; k < freeSlots_.size(); k++) {
    if (freeSlots_[k] <= parent) continue;
    if (escolha == freeSlots_.size() || freeSlots_[k] < freeSlots_[escolha]) escolha = k;
  }
  if (escolha < freeSlots_.size()) {
    const NodeIndex slot = freeSlots_[escolha];
    freeSlots_.erase(freeSlots_.begin() + static_cast<std::ptrdiff_t>(escolha));
    return slot;
  }
  if (parents_.size() >= capacity_) return kNoParent;

  const double* antes = world_.data();
  const NodeIndex slot = static_cast<NodeIndex>(parents_.size());
  parents_.push_back(kNoParent);
  locals_.emplace_back();
  radii_.push_back(0.0f);
  visibleFlags_.push_back(0);
  materialVisibleFlags_.push_back(0);
  shadowSides_.push_back(kShadowSideBack);
  flags_.push_back(0);
  geometryIds_.push_back(kNoGeometry);
  bounds_.emplace_back();
  removed_.push_back(1);
  dirty_.push_back(0);
  local_.resize(local_.size() + kMatrixFloats, 0.0);
  world_.resize(world_.size() + kMatrixFloats, 0.0);
  // Guarda alta: se isto disparar, o JS está segurando um ponteiro morto e a
  // falha apareceria como artefato visual, não como exceção (SPEC-0234).
  if (world_.data() != antes) {
    std::fprintf(stderr, "[sceneMirror] ERRO: o vetor de matrizes REALOCOU no append");
    std::fputc(0x0A, stderr);
  }
  return slot;
}

void SceneMirror::writeNode(NodeIndex index, const NodeDesc& node, NodeIndex parent) {
  const auto i = static_cast<size_t>(index);
  parents_[i] = parent;
  locals_[i] = node.transform;
  radii_[i] = node.radius;
  visibleFlags_[i] = node.visible ? 1 : 0;
  materialVisibleFlags_[i] = node.materialVisible ? 1 : 0;
  shadowSides_[i] = node.shadowSide;
  flags_[i] = node.flags;
  geometryIds_[i] = node.geometryId;
  bounds_[i] = node.bounds;
  removed_[i] = 0;
  dirty_[i] = 1;

  // Compõe já: o JS aponta o `matrixWorld.elements` para este slot no mesmo
  // frame do `childadded`, e o `three` pode lê-lo antes do próximo update —
  // um slot reaproveitado traria a matriz do nó anterior.
  //
  // Usa a matriz de mundo do pai como o último `updateAndCull` a deixou. Se
  // ainda não houve nenhum (append antes do primeiro frame), sai zerada e o
  // update seguinte corrige — o nó nasce com `dirty` ligado.
  compose(&local_[i * kMatrixFloats], locals_[i]);
  if (parent == kNoParent) {
    std::memcpy(&world_[i * kMatrixFloats], &local_[i * kMatrixFloats],
                kMatrixFloats * sizeof(double));
  } else {
    multiply(&world_[i * kMatrixFloats], &world_[static_cast<size_t>(parent) * kMatrixFloats],
             &local_[i * kMatrixFloats]);
  }
}

AppendResult SceneMirror::appendBatch(const std::vector<NodeDesc>& nodes, std::vector<NodeIndex>& out) {
  out.clear();
  if (nodes.empty()) return AppendResult::kAppended;

  // Fase 1: resolve pais e escolhe slots SEM escrever nada. Ou o lote inteiro
  // entra, ou nada entra — um lote pela metade deixaria filho sem pai.
  std::vector<NodeIndex> livres = freeSlots_;
  std::vector<NodeIndex> pais(nodes.size(), kNoParent);
  std::vector<NodeIndex> slots(nodes.size(), kNoParent);
  size_t fim = parents_.size();
  for (size_t i = 0; i < nodes.size(); i++) {
    NodeIndex parent = nodes[i].parent;
    if (isBatchParent(parent)) {
      const int32_t pos = decodeBatchParent(parent);
      // O pai tem de vir ANTES no lote; senão o índice dele ainda não existe.
      if (pos < 0 || static_cast<size_t>(pos) >= i) return AppendResult::kBadParent;
      parent = slots[static_cast<size_t>(pos)];
    } else if (parent < 0 || static_cast<size_t>(parent) >= parents_.size() ||
               removed_[static_cast<size_t>(parent)] != 0) {
      // Raiz nova não entra por append (a cena já tem a dela), e pai lápide
      // tampouco: é o que mantém a invariante de que nó vivo nunca aponta
      // para slot morto — de que o `removeSubtree` depende.
      return AppendResult::kBadParent;
    }
    pais[i] = parent;

    size_t escolha = livres.size();
    for (size_t k = 0; k < livres.size(); k++) {
      if (livres[k] <= parent) continue;
      if (escolha == livres.size() || livres[k] < livres[escolha]) escolha = k;
    }
    if (escolha < livres.size()) {
      slots[i] = livres[escolha];
      livres.erase(livres.begin() + static_cast<std::ptrdiff_t>(escolha));
    } else {
      if (fim >= capacity_) return AppendResult::kOutOfCapacity;
      slots[i] = static_cast<NodeIndex>(fim);
      fim++;
    }
  }

  // Fase 2: agora escreve. `takeSlot` repete a escolha da fase 1 porque parte
  // do mesmo estado, e a capacidade já foi conferida.
  for (size_t i = 0; i < nodes.size(); i++) {
    const NodeIndex slot = takeSlot(pais[i]);
    if (slot == kNoParent) {  // impossível depois da fase 1; nunca escreve fora
      std::fprintf(stderr, "[sceneMirror] ERRO: a fase 2 do append ficou sem slot");
      std::fputc(0x0A, stderr);
      return AppendResult::kOutOfCapacity;
    }
    writeNode(slot, nodes[i], pais[i]);
    out.push_back(slot);
    liveCount_++;
  }
  return AppendResult::kAppended;
}

int32_t SceneMirror::removeSubtree(NodeIndex root) {
  if (root < 0 || static_cast<size_t>(root) >= parents_.size()) return 0;
  if (removed_[static_cast<size_t>(root)] != 0) return 0;

  int32_t saiu = 0;
  const auto apagar = [&](size_t i) {
    removed_[i] = 1;
    visibleFlags_[i] = 0;
    materialVisibleFlags_[i] = 0;
    shadowSides_[i] = kShadowSideBack;
    flags_[i] = 0;
    radii_[i] = 0.0f;
    geometryIds_[i] = kNoGeometry;
    bounds_[i] = Bounds{};
    dirty_[i] = 0;
    freeSlots_.push_back(static_cast<NodeIndex>(i));
    if (liveCount_ > 0) liveCount_--;
    saiu++;
  };

  apagar(static_cast<size_t>(root));
  // Uma passada para frente basta: filho vem depois do pai, então quando se
  // chega no filho o pai já está marcado. E um nó VIVO nunca aponta para um
  // slot morto (o append recusa pai lápide), então `removed_[pai]` só é
  // verdade para descendente do que acabou de sair.
  for (size_t i = static_cast<size_t>(root) + 1; i < parents_.size(); i++) {
    if (removed_[i] != 0) continue;
    const NodeIndex pai = parents_[i];
    if (pai != kNoParent && removed_[static_cast<size_t>(pai)] != 0) apagar(i);
  }
  return saiu;
}

void SceneMirror::applyTransforms(const double* buffer, size_t valueCount) {
  const size_t count = valueCount / kSyncFloatsPerNode;
  for (size_t i = 0; i < count; i++) {
    const double* row = buffer + i * kSyncFloatsPerNode;
    const auto index = static_cast<size_t>(row[0]);
    if (index >= locals_.size()) continue;  // o JS pode estar à frente numa remoção
    // Lápide não volta a viver por linha de sincronização: o slot pode já ter
    // sido reaproveitado por outro nó, e ressuscitar o antigo desenharia a
    // sombra de um objeto que saiu da cena.
    if (removed_[index] != 0) continue;
    Transform& t = locals_[index];
    t.px = row[1]; t.py = row[2]; t.pz = row[3];
    t.qx = row[4]; t.qy = row[5]; t.qz = row[6]; t.qw = row[7];
    t.sx = row[8]; t.sy = row[9]; t.sz = row[10];
    // O `visible` vem junto do transform, e não só do `build`: esconder um
    // objeto é tão comum quanto movê-lo (LOD, peça trocada, carro de outro
    // jogador) e um espelho que não vê isso desenha sombra do que sumiu. O
    // `material.visible` viaja no mesmo slot, pelo mesmo motivo (SPEC-0245).
    const auto frameFlags = static_cast<uint32_t>(row[kSyncFlags]);
    visibleFlags_[index] = (frameFlags & kSyncVisible) != 0 ? 1 : 0;
    materialVisibleFlags_[index] = (frameFlags & kSyncMaterialVisible) != 0 ? 1 : 0;
    // O lado da face do passe de sombra viaja nos mesmos bits (SPEC-0245):
    // `material.side` e `material.shadowSide` sao reavaliados pelo `three` a
    // cada travessia, e fotografa-los no `build` seria o terceiro erro do
    // mesmo tipo nesta serie.
    shadowSides_[index] =
        static_cast<uint8_t>((frameFlags >> kSyncShadowSideShift) & kSyncShadowSideMask);
    dirty_[index] = 1;
  }
}

int SceneMirror::updateAndCull(const float* viewProj, const float* planes) {
  visible_.clear();
  changed_.clear();
  const size_t count = parents_.size();

  for (size_t i = 0; i < count; i++) {
    const NodeIndex parent = parents_[i];
    // Um nó precisa recompor a matriz de mundo se o transform dele mudou OU se
    // o pai mudou — e como o pai vem antes, a flag dele já está atualizada.
    const bool parentDirty = parent != kNoParent && dirty_[static_cast<size_t>(parent)] != 0;
    const bool selfDirty = dirty_[i] != 0;
    if (selfDirty) compose(&local_[i * kMatrixFloats], locals_[i]);
    if (selfDirty || parentDirty) {
      if (parent == kNoParent) {
        std::memcpy(&world_[i * kMatrixFloats], &local_[i * kMatrixFloats],
                    kMatrixFloats * sizeof(double));
      } else {
        multiply(&world_[i * kMatrixFloats], &world_[static_cast<size_t>(parent) * kMatrixFloats],
                 &local_[i * kMatrixFloats]);
      }
      dirty_[i] = 1;  // propaga para os filhos, que vêm depois
      // Registra ANTES de as flags serem limpas: e esta lista que diz quais
      // uniformes precisam subir para a GPU (M3 do ADR-0237).
      changed_.push_back(static_cast<NodeIndex>(i));
    }
  }

  // Os planos já vêm em espaço de MUNDO (o JS os deriva da viewProj uma vez
  // por frame), então o teste é direto contra a posição de mundo do nó — não há
  // matriz a multiplicar por objeto aqui.
  (void)viewProj;
  for (size_t i = 0; i < count; i++) {
    if (!visibleFlags_[i] || radii_[i] <= 0.0f) continue;
    const double* w = &world_[i * kMatrixFloats];
    if (insideFrustum(planes, w[12], w[13], w[14], radii_[i])) {
      visible_.push_back(static_cast<NodeIndex>(i));
    }
  }

  // As flags só podem ser limpas DEPOIS da propagação inteira: elas são o
  // canal que avisa o filho de que o pai se mexeu.
  std::memset(dirty_.data(), 0, dirty_.size());
  return static_cast<int>(visible_.size());
}

}  // namespace scene
