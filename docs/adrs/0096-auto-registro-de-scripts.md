# 0096 - Auto-registro de scripts (nome pelo arquivo, estilo Unity)

**Data:** 2026-07-05
**Status:** aceito

## Contexto

Todo script anexável (ADR-0085) exigia duas linhas de glue no `main.ts`
(`import` + `registerScript('Nome', Classe)`). Criar script e esquecer o
registro = o Inspector não lista e a cena não instancia, sem erro claro.
Na Unity o script "existe" só por estar na pasta, nomeado pelo arquivo —
pedido do usuário do teste4.

Restrições que moldaram o desenho:
- O engine roda no browser: **não enxerga pastas**. Descoberta tem que ser do
  bundler — e `import.meta.glob` só funciona no código do JOGO (o bundle
  vendorizado é pré-buildado; um glob lá dentro não resolveria a pasta do
  projeto).
- `class.name` **minifica** no build de produção, e o nome do script é DADO
  persistido (level.json / scene-data.json) — não pode ser o default.

## Decisão

- **`registerScripts(modules)`** no `ScriptRegistry`: recebe o resultado de
  `import.meta.glob('./scripts/*.ts', { eager: true })`, acha as subclasses de
  `ScriptBehavior` nos exports e registra cada uma. Nome, em ordem de
  precedência:
  1. **`static scriptName`** (override explícito — nome amigável/estável);
  2. **nome do arquivo** (estilo Unity; a chave do glob resolve no build,
     então **sobrevive à minificação**) — só quando o arquivo tem UM script;
  3. `class.name` (arquivo com vários scripts; aí `keepNames` ou `scriptName`).
- **Template** ganha `scripts/` (README + exemplo `Girar.ts`) e o `main.ts` já
  liga `registerScripts(glob)` + `ScriptHostSystem`. Uma linha, pra sempre:
  criar arquivo = script disponível no Inspector.
- `registerScript(nome, classe)` continua existindo (registro manual/nome
  alternativo) — o auto-registro é aditivo.

## Consequências

- DX Unity-like: soltar `MeuScript.ts` em `scripts/` basta.
- **Renomear arquivo (ou scriptName) muda o nome persistido** — cenas salvas
  que o referenciam precisam acompanhar. Documentado no README da pasta.
- O template exige `"types": ["vite/client"]` no tsconfig (tipos do
  `import.meta.glob`).
- Testes: `tests/scripts/registerScripts.test.ts` (nome por arquivo, override,
  múltiplos por arquivo, exports não-script ignorados).
