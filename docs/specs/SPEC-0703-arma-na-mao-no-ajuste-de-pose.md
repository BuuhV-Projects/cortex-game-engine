# SPEC-0703 - Arma na mão no ajuste de pose do Studio (pose por arma × clipe)

**Data:** 2026-11-06
**Status:** aceito

Fase F1 do ADR-0702. Estende a aba **Animações** do auto-rig (SPEC-0349, adendos 8 e 9).

## Contexto

O usuário quer ver cada arma do jogo na mão do personagem enquanto ajusta a pose junta a
junta, e guardar um ajuste por arma × clipe. A conta da pose e das ligações não muda; muda
onde ela é guardada (uma variante por arma) e o que aparece na prévia (a arma presa na mão).

## Comportamento

### Armas do projeto

- GLB das armas: `skinned.weaponsGlb` da config do rig (relativo ao projeto); ausente =
  `assets/armas/armas.glb`. Sem o arquivo, o seletor mostra só "Sem arma".
- Cada nó **raiz** da cena do GLB que tem um filho com nome terminado em `_Grip_L` é uma
  arma; o nome do nó é o código da arma (`ARM-01`, `ESC-01`…). A origem do nó é o `Grip_R`
  (+Z frente, +Y cima); o `Grip_L` é a posição do filho no espaço da arma.

### Seletor (painel "Pose (deste clipe)")

- "Arma": "Sem arma" + as armas do GLB, em ordem de nome. Trocar com edição não salva da
  variante mostrada pede confirmação (como trocar de clipe).
- Com uma arma escolhida:
  - um clone do nó da arma fica preso ao osso `RightHand` pela **pegada** da arma
    (abaixo) e acompanha a mão em todo quadro, tocando ou pausado;
  - uma bolinha (cor própria) marca o `Grip_L` no mundo, sem teste de profundidade;
  - a pose e as ligações editadas são as da **variante** `clipe@ARMA`.

### Variante `clipe@ARMA` (config)

- Gravada em `skinned.clips[clipe].weapons[ARMA] = { "pose": {…}, "follow": [ … ] }`, com o
  formato dos adendos 8 e 9. Pose vazia remove `pose`, lista vazia remove `follow`, entrada
  vazia remove a arma e `weapons` vazio some; o resto do JSON fica igual.
- Só existe variante de clipe que está em `skinned.clips` (como a pose do adendo 8).
- Enquanto a variante não tem nada salvo nem editado, ela **parte do clipe base**: a pose e
  as ligações desejadas são as do clipe. A primeira edição copia as do clipe e muda a cópia.
- "Aplicar a todos os clipes" (pose) com arma escolhida aplica a pose na variante daquela
  arma em todos os clipes.
- Gerado no build: o pipeline (F2) assa a variante como a animação `clipe@ARMA` do GLB, com
  `clips["clipe@ARMA"].poseOffsets`/`follow` no JSON do skin. Se o GLB tem `clipe@ARMA`, a
  prévia toca essa animação com a arma escolhida; senão toca o clipe base e mostra a
  diferença desejado × gerado do clipe base (mesma regra do adendo 8).

### Pegada da arma

- `skinned.weaponGrips[ARMA] = { "offset": [x,y,z], "rotation": [x,y,z,w] }`, no espaço do
  osso `RightHand` (sem escala): onde fica o `Grip_R` e como a arma gira na mão. Vale para
  todos os clipes daquela arma. 6 casas; igual ao padrão remove a entrada; vazio remove o
  campo.
- Padrão (sem entrada): `offset = [0, 0.08, 0]` (a palma, como o `PALM` do jogo) e
  `rotation = [0, 0.707107, 0.707107, 0]` (180° em torno de (0,1,1)/√2): no `RightHand` do
  Mixamo o +Y aponta para os dedos e, no clipe `pistolIdle` do LUC-01 (mão segurando a
  pistola), os dedos vão para a frente e o +Z para cima — então o cano fica no +Y do osso e o
  topo da arma no +Z.
- Clicar na arma (perto do `Grip_R`) seleciona a **pegada**: as setas (`W`) movem e as
  argolas (`E`) giram a arma em relação à mão. A mão não se mexe. "Zerar pegada" volta ao
  padrão. A pegada entra no mesmo Ctrl+Z e no "Salvar pose".

### Mão de apoio

- Botão "Mão esquerda no apoio" (arma escolhida, variante editável): leva a **palma** da mão
  esquerda (8 cm do pulso no eixo dos dedos) ao `Grip_L` pela IK de dois ossos do adendo 8 —
  como a mão gira com a IK, o alvo do pulso é refeito algumas vezes (`wristTarget`) e, no quadro seguinte, cria a ligação
  `LeftHand → RightHand` do adendo 9 (a mão de apoio acompanha a arma no recuo). Fora do
  alcance, estica até o limite. Desfaz com um Ctrl+Z.

### i18n

Textos novos em pt/en.

## Código

- `electron/renderer/characterRigWeapon.ts` (puro): chave `clipe@ARMA`, leitura e gravação
  das variantes e das pegadas na config, lista de armas a partir dos nós.
- `electron/renderer/RigWeapon.ts`: carrega o GLB das armas, prende o clone na mão, marca o
  `Grip_L`.
- Divididos por tamanho (regra das 500 linhas, mudança tocada): `RigPoseEditor.ts` →
  `rigPoseStore.ts` (estado salvo/editado/gerado, desfazer, gravar) e `RigPoseOverlay.ts`
  (esqueleto desenhado e seleção por bolinha); `RigAnimationPreview.ts` → `RigArmAdjust.ts`
  (sliders dos braços, adendos 4–7).

## Aceite

1. Testes puros: chave `clipe@ARMA` (montar/separar, nome de clipe com `@` recusado como
   arma), leitura/gravação de variantes (ordem dos campos, vazios somem, clipe fora da
   config ignorado), variante partindo do clipe base, pegada (padrão, 6 casas, igual ao
   padrão some), lista de armas por nós com `_Grip_L`.
2. Na prévia real (DDD 61, LUC-01): escolher `ARM-02` → o fuzil aparece na mão direita e
   acompanha o clipe; a bolinha do `Grip_L` aparece no fuzil; "Mão esquerda no apoio" leva a
   mão até ela e, tocando, a mão fica no fuzil; mover a junta grava em
   `clips[clipe].weapons["ARM-02"].pose`; girar a arma grava `weaponGrips["ARM-02"]`; "Sem
   arma" volta ao clipe base sem mudança.
3. Sem arma escolhida a aba fica igual a antes (testes dos adendos 4–9 verdes).
