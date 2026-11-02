# 0009 - Trail no PR e no pre-commit, mapa fora do git

**Data:** 2026-11-02
**Status:** aceito

## Contexto

O repo passou a usar o trail (`@trailhq/trail-code`): mapa de código para os
agentes (`.trail/cache/`) e learnings das sessões (`.trail/learnings/`). Faltava
garantir que todo PR passe pelo trail e que o mapa local de cada dev fique fresco.

O mapa é ~2,3 MB de cards `.md` + um `.graph/wiring.json` de ~8,6 MB que muda em
todo commit de código. `trail build --check` só compara contra um mapa que exista
no checkout.

## Decisão

**Mapa NÃO é versionado** (segue no `.gitignore`, como o trail gera).

- **PR** (`pr.yml`, job `Trail`): instala o trail pinado, roda `trail build`
  (prova que o mapa gera sobre o código do PR) e `trail check --base origin/main`
  (diff contra os learnings — exit 1 em conflito). Avisa (sem reprovar) quando há
  versão nova do trail publicada.
- **Local** (`.husky/pre-commit`): `trail build` incremental (~3,5 s) a cada
  commit, se o trail estiver instalado. Falha dele não bloqueia o commit.

Alternativa descartada: versionar o mapa e reprovar no CI com `trail build --check`.
Reescreveria ~8,6 MB por commit e todo PR paralelo conflitaria no `wiring.json`,
travando o auto-merge.

## Consequências

- Ninguém precisa "atualizar o mapa" no PR: cada máquina e o CI geram o seu.
- O que o dev ainda precisa commitar são os **learnings** (só a sessão gera).
- O hook de commit ganha ~3,5 s (exceção consciente ao "leve" do TDR-0008).
- Subir a versão do trail = trocar `TRAIL_VERSION` no `pr.yml`.
- O job `Trail` só vira obrigatório quando incluído no ruleset "Protecao do main".
