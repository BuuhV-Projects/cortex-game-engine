# 0239 - Uniformes por objeto nativos (M3 do ADR-0237)

**Data:** 2026-09-21
**Status:** parcial — estrutura e política feitas; medição em regime depende do M5

## Contexto

O M2 provou que `override` funciona e que a cena gera só **5 pipelines**. O M3
cuida do que muda **por objeto**: a matriz de modelo e os parâmetros do material
que não entram na chave do pipeline (cor, opacidade, metálico, rugosidade,
emissivo, espessura do contorno).

Duas medições antigas definem o desenho:

- **O `three` cria um bind group por objeto**, e isso está dentro dos 33,5 us
  por draw. O spike da fase 1, que usou **um** bind group com offset dinâmico,
  chegou a 2,2 us.
- **A SPEC-0225 mediu que os uniformes de objeto parado não precisam ser
  reescritos**: mover a câmera gerava 22 `writeBuffer` a mais, não 370. Os
  uniformes por objeto não dependem da câmera.

**Critério do marco (ADR-0237):** `writeBuffer` por frame proporcional ao que
**se moveu**, não ao total de objetos.

## Decisão

Um **pool de uniformes**: um buffer grande, dividido em slots alinhados a 256
bytes (o alinhamento que o WebGPU exige para offset dinâmico), com um slot por
objeto desenhável e **um único bind group** para todos.

O que decide a escrita é o que o `SceneMirror` já sabe: ele marca quem teve a
matriz de mundo recomposta no frame. O M3 só precisa que ele **conte essa
história antes de limpar as flags** — daí o `changedThisFrame()`.

### Por que slot fixo por objeto, e não um anel por frame

Um anel (escrever tudo todo frame, avançando o offset) é mais simples e é o que
muita engine faz. Aqui ele seria errado pelo motivo medido acima: escrever
todos os objetos todo frame é exatamente o custo que a SPEC-0225 mostrou ser
desnecessário. Com slot fixo, quem não se moveu mantém o conteúdo do frame
anterior e **não gera `writeBuffer` nenhum**.

O preço é precisar de um slot por objeto (256 bytes × ~1.300 = 333 KB) e de uma
realocação quando a cena cresce. É barato perto de reescrever 1.300 uniformes
por frame.

## O que é testável sem GPU

O harness nativo não tem device, e o que importa neste marco é a **política**,
não a chamada:

- alinhamento e cálculo de offset por slot;
- alocação e reuso de slot por objeto;
- a lista de escritas de um frame ser exatamente a dos objetos que mudaram;
- um frame sem movimento nenhum produzir **zero** escritas.

A contagem real de `writeBuffer` na cena viva depende do M5 e fica declarada
como pendente — mesma regra do M2.
