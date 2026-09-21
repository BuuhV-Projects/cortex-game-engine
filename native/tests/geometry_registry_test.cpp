// Testes do registro de geometria (SPEC-0241, passo 2).
//
// Exercita a POLITICA sem GPU: os handles sao opacos, entao ponteiros falsos
// bastam para cobrir registrar, encontrar, substituir e remover.
#include "harness.h"

#include "../src/render/geometry_registry.h"

namespace tests {
namespace {

/** Handles falsos: o registro nunca dereferencia, so guarda. */
WGPUBuffer buffer(uintptr_t valor) { return reinterpret_cast<WGPUBuffer>(valor); }

render::GeometryEntry indexada(uintptr_t vertice, uintptr_t indice, uint32_t indices) {
  render::GeometryEntry e;
  e.vertexBuffer = buffer(vertice);
  e.indexBuffer = buffer(indice);
  e.indexCount = indices;
  return e;
}

}  // namespace

void testGeometryRegistry() {
  render::GeometryRegistry reg;
  CHECK(reg.size() == 0);
  CHECK(reg.find(1) == nullptr);

  // Caso comum: malha indexada.
  CHECK(reg.set(1, indexada(0x10, 0x20, 36)));
  CHECK(reg.size() == 1);
  const render::GeometryEntry* achada = reg.find(1);
  CHECK(achada != nullptr);
  CHECK(achada->vertexBuffer == buffer(0x10));
  CHECK(achada->indexBuffer == buffer(0x20));
  CHECK(achada->indexCount == 36);

  // Malha NAO indexada: vale se tiver contagem de vertices.
  render::GeometryEntry direta;
  direta.vertexBuffer = buffer(0x30);
  direta.vertexCount = 3;
  CHECK(reg.set(2, direta));
  CHECK(reg.find(2)->indexBuffer == nullptr);
  CHECK(reg.find(2)->vertexCount == 3);

  // RECUSA em vez de aceitar entrada que nao desenha nada: sem buffer de
  // vertice, e com buffer mas sem indice nem contagem.
  render::GeometryEntry semVertice;
  semVertice.indexBuffer = buffer(0x40);
  semVertice.indexCount = 3;
  CHECK(!reg.set(3, semVertice));
  CHECK(reg.find(3) == nullptr);

  render::GeometryEntry semNadaParaDesenhar;
  semNadaParaDesenhar.vertexBuffer = buffer(0x50);
  CHECK(!reg.set(4, semNadaParaDesenhar));
  CHECK(reg.find(4) == nullptr);

  // Indice indexado com contagem zero tambem nao desenha.
  CHECK(!reg.set(5, indexada(0x60, 0x70, 0)));
  CHECK(reg.find(5) == nullptr);

  // Re-registrar o MESMO id substitui (a geometria pode ter sido recriada).
  CHECK(reg.set(1, indexada(0x80, 0x90, 12)));
  CHECK(reg.size() == 2);
  CHECK(reg.find(1)->vertexBuffer == buffer(0x80));
  CHECK(reg.find(1)->indexCount == 12);

  reg.erase(1);
  CHECK(reg.find(1) == nullptr);
  CHECK(reg.size() == 1);

  reg.clear();
  CHECK(reg.size() == 0);
}

}  // namespace tests
