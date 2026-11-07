# 0702 - Pegada de arma por arma × clipe, assada no rig, com NPC de ossos de verdade

**Data:** 2026-11-06
**Status:** aceito

## Contexto

Pedido do usuário: pôr o fuzil (e todas as armas) no ajuste de animação do Studio
(aba Animações do auto-rig, SPEC-0349 adendos 8 e 9) para ver e acertar como o player
segura cada arma — e fazer o mesmo para os NPCs, que compartilham as animações ("fazer
pra um faz pra todos"). Ele mesmo ajusta pés, mãos, ombros etc.

Como estava (2026-11-06):

- **Player** (LUC-01): skin Mixamo de 22 ossos; a pose por clipe é gravada em
  `tools/characters/LUC-01.json` (`skinned.clips[nome].pose`/`follow`) e **assada** no GLB
  pelo `tools/prepare-character.sh` + `scripts/blender/character_*.py` (~2.100 linhas, só
  no DDD 61). O Port Hollow só copia o GLB.
- **Arma no jogo** (Port Hollow, `game/combat/gunHold.ts`): a pistola vai na palma pelo
  clipe de pistola, mas orientada pela mira, não pela mão; a arma longa é **postura
  calculada** (`utils/gunPose.ts`) + IK nos ossos. Não há clipe de arma longa.
- **NPCs**: o lote não tem ossos — um boneco de membros rígidos num shader WGSL próprio
  (`entities/crowd/people*.ts`), com 21 canais por quadro (quadril x/z, joelho, ombro
  x/y/z, cotovelo de cada lado + corpo). Não existe pulso, pé, clavícula, coluna nem
  cabeça como junta, e o Studio não tem o que abrir.
- **Armas**: `assets/armas/armas.glb`, um nó por arma (origem no `Grip_R`, +Z frente, +Y
  cima) com o filho `<ARMA>_Grip_L` (apoio da mão esquerda).

## Decisão

Escolhas do usuário entre as alternativas apresentadas:

1. **Ajuste por arma × clipe.** Cada clipe pode ter uma variante por arma, com pose e
   ligações próprias. Na config: `skinned.clips[clipe].weapons[ARMA] = { pose, follow }`
   (mesmo formato do adendo 8/9). No GLB assado vira o clipe `clipe@ARMA`; o jogo toca a
   variante quando ela existe e cai no clipe base quando não.
   - Rejeitadas: *arma × modo* (mira/pronto) somado por cima de qualquer clipe — menos
     ajustes, mas o usuário quer controle por clipe; *postura × modo* — todas as armas
     longas iguais.
2. **Assado no GLB que o jogo já tem, pelo Studio** (revisto em 2026-11-06, ver abaixo). O Studio
   grava as correções e as variantes `clipe@ARMA` direto no GLB do personagem do projeto aberto, a
   partir das animações que já estão nele, com a mesma conta da prévia. Não reimporta fontes (FBX,
   marcadores, bone heat) e não importa nada de outro jogo.
   - Rejeitadas: JSON somado por quadro pelo jogo (duas contas da mesma pose, nada a ver do jeito que o
     jogo toca); levar o `prepare-character` do DDD 61 para a engine (escolha inicial, desfeita: o
     pipeline reimporta tudo das fontes, inclusive clipes de outro jogo, e o pedido era só editar o que
     o jogo tem).
   - Consequência aceita: a arma longa precisa de clipes de arma longa no GLB do player para ter
     variante; a postura calculada deixa de ser o caminho do player quando a variante existe.
3. **Arma presa rígida na mão direita** por uma pegada por arma:
   `skinned.weaponGrips[ARMA] = { offset: [x,y,z], rotation: [x,y,z,w] }`, no espaço do
   osso `RightHand` (posição do `Grip_R` e giro da arma). A mesma pegada vale no Studio e
   no jogo, então o que se vê na prévia é como o jogo segura. O `Grip_L` é mostrado como
   alvo da mão de apoio; a mão esquerda chega lá pela IK do adendo 8 e fica presa pela
   ligação "seguir" do adendo 9 (mão esquerda → mão direita).
4. **NPC ganha ossos de verdade**: o lote passa a skin com um esqueleto compartilhado por
   todo o elenco, e esse rig abre no Studio como o do player — um ajuste vale para todos.
   - Rejeitadas: GLB de prévia com as juntas do lote (sem pulso, pé, coluna) e o esqueleto
     do player como proxy (conversão aproximada).
   - É a maior frente (render e perf da multidão) e terá **ADR próprio** ao começar
     (skinning na GPU no lote, LOD, custo por NPC).

### Fases

| Fase | Onde | Entrega |
|---|---|---|
| F1 | engine (Studio) | Seletor de arma na aba Animações, arma na mão pela pegada, `Grip_L` como alvo, pose/ligações por arma × clipe gravadas na config (SPEC-0703) |
| F2 | engine (Studio) | Gravar no GLB do jogo: corrige os clipes ajustados e cria as variantes `clipe@ARMA` no GLB e no JSON do skin, com `weaponGrips` (SPEC-0704) |
| F3 | jogo (Port Hollow) | Player toca `clipe@ARMA` quando segura a arma e prende a arma pela pegada |
| F4 | jogo + engine | NPC com ossos (ADR próprio): rig compartilhado, skin no lote, clipes por osso, editável no Studio como o player |
| F5 | jogo | NPCs tocando os clipes ajustados e as variantes de arma |

**Revisão (2026-11-06).** O usuário esclareceu que queria só editar no Studio as animações que o jogo já
tem, com a arma escolhida na mão, para o player e para os NPCs. A F2 deixou de ser levar o pipeline do
DDD 61 para a engine (que reimportava das fontes e trazia clipes de outro jogo) e passou a ser gravar o
ajuste no GLB existente. O `prepare-character` do DDD 61 continua lá, para gerar personagem do zero.

## Consequências

- Um formato só (o da config do rig) para player e NPC; o Studio não precisa conhecer o
  lote antigo de membros.
- Mais clipes no GLB (um por arma × clipe ajustado); só existem as variantes salvas.
- Até a F3, o Port Hollow segue com a pegada atual (postura calculada); a F1 já serve para
  ver e ajustar, e a config fica pronta para a F2 assar.
- A F4 mexe no render da multidão: é decidida e medida no ADR dela, não aqui.
