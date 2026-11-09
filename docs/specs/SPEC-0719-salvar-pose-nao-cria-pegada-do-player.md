# SPEC-0719 - Salvar pose não cria a pegada `ARMA#<player>` e mantém a indentação da config

**Data:** 2026-11-09
**Status:** implementado
**Relacionado:** SPEC-0711, ADR-0710, SPEC-0708

## Contexto

No Port Hollow, salvar a pose do `pistolIdle@ARM-01` com "Aplicar a: Selecionados" (LUC-01 e cinco NPCs) gravou no
`LUC-01.json`, ao lado da pegada certa `weaponGrips["ARM-01"]`, uma `weaponGrips["ARM-01#LUC-01"]` com a pegada
padrão (`[0, 0.08, 0]`, 180°). A pistola do detetive virou de cabeça para baixo no jogo.

Causa: no player, o Studio mostra e edita a pegada na chave sem alvo (`ARMA`, a chave da pose é `clipe@ARMA`). O
"Aplicar a" levava a pegada editada da chave mostrada para `ARMA#LUC-01` e descartava a edição de `ARMA` (a chave
mostrada não é alvo). Só que o assado (e daí o jogo) resolve `ARMA#<player>` antes de `ARMA` (SPEC-0711): a chave
nova passa a esconder a pegada que a prévia mostra e edita, e nenhum ajuste posterior no player a alcança. A pegada
`ARMA` editada naquele momento estava no padrão (como o "Zerar pegada" deixa), e foi esse valor que virou
`ARMA#LUC-01`.

O mesmo salvar regravou o arquivo inteiro com indentação de 1 espaço (`serializeConfig`), e o arquivo do jogo usa 2:
diff de 1.396 linhas para uma mudança de 80.

## Decisão

1. **A pegada do player é a de `ARMA`** (o que a prévia mostra e o ADR-0710 já diz: "`weaponGrips[ARMA]` é a do
   player"). No "Aplicar a", o alvo que é o próprio player leva a pegada para `ARMA`, nunca para `ARMA#<player>`;
   quando a chave mostrada é a do player (`clipe@ARMA`) e o player está entre os alvos, a edição da pegada dela
   **fica** (não é descartada junto com a da pose). Com o player fora dos alvos (ex.: só NPCs), a regra da SPEC-0711
   continua: a pegada vai para os NPCs e a de `ARMA` volta ao que estava.
2. A cópia para os NPCs continua a pegada efetiva da chave mostrada (editada ou salva), só quando ela foi editada.
3. **Indentação preservada**: ao regravar a config, o Studio usa a indentação do texto que leu (a da primeira chave);
   sem texto anterior, 1 espaço como antes.

Uma `ARMA#<player>` já gravada (como a do Port Hollow) não é apagada sozinha: limpe à mão no JSON.

## Implementação

- `rigPoseStore.ts`: `applyEditTo(from, to, space, player)` manda a pegada do alvo `player` para `ARMA`;
  `discardEdit(key, keepGrip)`.
- `RigApplyTo.ts`: passa o player e mantém a pegada quando o player é alvo.
- `characterRigSelection.ts`: `serializeConfig(cfg, like)` com a indentação de `like`; os quatro escritores passam o
  texto lido.

## Aceite

1. Teste: pegada `ARM-01` salva, pegada da chave mostrada editada, "Selecionados" com o player e NPCs → nenhuma
   `ARM-01#LUC-01`; `ARM-01` gravada com a edição; os NPCs ganham `ARM-01#npc-NNN`.
2. Teste: sem editar a pegada, salvar a pose não muda `weaponGrips`.
3. Teste: regravar um JSON com 2 espaços sai com 2 espaços.
