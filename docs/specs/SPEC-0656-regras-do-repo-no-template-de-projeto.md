# SPEC-0656 - Regras do repo no PR dos jogos (template de projeto)

**Data:** 2026-11-01
**Status:** aceito

## Contexto

A engine checa as regras do CLAUDE.md no diff de cada PR (`.github/scripts/pr-rules.mjs`, job "Regras do repo",
SPEC-0654): arquivo de código acima de 500 linhas fora de `docs/pendencias-refatoracao.md`, `package-lock.json`,
`console.log` no engine e código sem registro. O job reprovou o PR #10 por dois arquivos grandes não registrados,
coisa que nenhuma revisão humana tinha pegado. Os jogos seguem as mesmas regras (500 linhas, yarn, `debug()` em vez de
`console.log`, SPEC antes do código), mas não tinham a checagem: projeto novo nasce do template sem `.github/`, e o
Port Hollow tem CI próprio sem esse job.

## Decisão

- `templates/new-project/.github/scripts/pr-rules.mjs`: as regras da engine adaptadas a um projeto de jogo (sem
  `src/`/`native/`):
  - ERRO: arquivo de código (`ts tsx js mjs cjs py sh ps1 rs`) com mais de 500 linhas que não está em
    `docs/pendencias-refatoracao.md`; `package-lock.json`; `console.log(` adicionado em código do jogo (fora de
    `scripts/`, `tests/`, `.github/`) — use o `debug(escopo, …)` da engine.
  - AVISO: código mudou sem `docs/specs|adrs|tdrs/` no PR.
  - Isentos: `vendor/`, `node_modules/`, `dist/`, `public/`, `src-tauri/`, `third_party/`.
  - Como na engine, só olha o que o PR toca (débito herdado não reprova PR que não mexe no arquivo).
- `templates/new-project/.github/workflows/pr-rules.yml`: roda o script em todo PR para a `main` (base × head).
- O Port Hollow ganha o mesmo script e um passo "Regras do repo" no job do seu `ci.yml` (o auto-merge dele espera esse
  CI), registrado na SPEC do próprio jogo.

## Detalhes (revisão do PR)

- A pendência vale só para o caminho EXATO: `docs/pendencias-refatoracao.md` é lido um caminho por linha (aceita `- ` e
  crases). Registrar `game/city.tsx` não libera `game/city.ts`.
- `console.log`: o arquivo INTEIRO do head decide o que é comentário ou string (`codeOnly` troca os dois por espaços
  mantendo as quebras de linha) e o diff decide o que é novo: só reprova a chamada (`console . log (`, com espaço ou
  quebra de linha entre os pedaços) que cai numa linha adicionada (número da linha pelos cabeçalhos `@@ … +c,d @@`).
  Bloco `/* … */` de várias linhas, string e comentário no fim da linha não reprovam; uma chamada antiga fora das
  linhas adicionadas também não. O job faz checkout do head (`ref: head.sha`) para o arquivo no disco ser o do diff.
- `parseAddedLines` tem teste com vários arquivos, exclusão, caminho entre aspas, linha adicionada começando com `++` e
  o número da linha no arquivo novo.

## Consequências

- Projeto novo já nasce com a checagem; jogo existente copia os dois arquivos (ou o passo, se já tem CI).
- Teste: `tests/templates/prRulesTemplate.test.ts` (as regras puras do script do template).
- O script do template é uma cópia adaptada do da engine: mudar uma regra exige mudar os dois (e os jogos).
