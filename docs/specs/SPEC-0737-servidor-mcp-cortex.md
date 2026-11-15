# SPEC-0737 - Servidor MCP `cortex`

**Data:** 2026-11-14
**Status:** aceito

## Contexto

ADR-0736 decidiu expor as ferramentas próprias do Studio e a API do engine como um servidor MCP stdio
para o Claude Code do dev. Esta spec descreve o servidor.

## Decisão

### Layout

```
mcp/
  server.ts            entrada: registra as tools no McpServer (stdio)
  toolDef.ts           tipo neutro { name, description, schema (zod shape), handler }
  context.ts           raiz do projeto, base de recursos (kits/, docs/), versão
  tools/kits.ts        list_kits, list_kit_assets, import_kit
  tools/assets.ts      measure_glb, inspect_assets
  tools/validate.ts    validate_scene
  tools/engineApi*.ts  engine_api_index, engine_api_section, engine_api_symbol, engine_api_search
  setup/               verificador de requisitos e registro (SPEC-0738)
```

O build (`yarn build:mcp`, `vite.mcp.config.ts`) gera `out/mcp/cortex-mcp.mjs` e `out/mcp/cortex-setup.mjs`,
bundles únicos para Node 22+, sem dependência de `node_modules`. O `electron-builder` copia `out/mcp/`
para `resources/mcp/`.

### Contexto de execução

- **Projeto:** toda tool que mexe em projeto aceita `projectDir` opcional; o padrão é o `cwd` do
  processo, que o Claude Code define como a pasta aberta. Caminhos relativos resolvem contra ele e
  não podem sair dele (mesma sandbox do Chat IA, ADR-0017).
- **Recursos:** `CORTEX_RESOURCES` (env) ou, por padrão, a pasta acima de `mcp/` (no app empacotado,
  `resources/`; no repo, a raiz). Dali saem `kits/` e `docs/cortex-game-engine/`.
- **Blender:** `inspect_assets` usa o mesmo localizador do auto-rig (`blenderLocate`, SPEC-0724):
  `BLENDER_PATH`, instalações comuns, `PATH`.

### Tools

| Tool | Entrada | Saída |
|---|---|---|
| `list_kits` | — | tabela: kit, nº de assets, roles, tags |
| `list_kit_assets` | `kit`, filtros `role`/`gameplayRole`/`tag` | arquivos com role, tamanho, tags |
| `import_kit` | `kit`, `only?` | copia para `assets/<kit>/` com `kit.json` e thumbnails; nome de `only` que o kit não tem é erro, sem copiar nada |
| `measure_glb` | `paths[]` | L×A×P em metros por arquivo (Node puro) |
| `inspect_assets` | `dir` | thumbnails (imagens) + tabela de medidas (Blender) |
| `validate_scene` | `scenes?`, `overlay?` | erros/avisos geométricos do `scenes/*.json`; `overlay` informado que não existe, ou overlay ilegível, é erro |
| `engine_api_index` | — | índice de `engine-api.md` e `architecture.md` (seção, linhas, símbolos) |
| `engine_api_section` | `doc`, `title` | texto inteiro da seção |
| `engine_api_symbol` | `name` | referência TypeDoc do export (`api/<tipo>/<Nome>.md`) |
| `engine_api_search` | `query`, `limit?` | candidatos ranqueados (nome, tipo, primeira linha) |

`engine_api_index` reaproveita `engineApiIndex.ts` (ADR-0114), movido para `mcp/`. Os dois guias também
ficam expostos como **resources** (`cortex://docs/engine-api.md`, `cortex://docs/architecture.md`).

**Versão:** as tools de API abrem a resposta com a versão do engine da doc (a do Studio instalado). O
vendor do jogo (`vendor/cortex-game-engine/`) não grava versão hoje, então não dá para avisar
divergência; quando a assinatura exata importar, a fonte é o `.d.ts` vendorizado (backlog abaixo).

### Erros

Erro de entrada (kit inexistente, caminho fora do projeto, cena inválida) volta como resultado com
`isError: true` e mensagem em pt, nunca como exceção que derruba o servidor.

## Consequências

- Logs de diagnóstico vão para stderr (stdout é o canal do protocolo).

## Backlog

- `playtest_game` headless (Chromium via Playwright) ou ponte com o Studio aberto.
- Agente `scene-critic` no `.claude/agents/` no lugar de `critique_scene`.
- Distribuir as skills/agentes do `.claude/` ao projeto do jogo (plugin do Claude Code), já que o
  instalador deixou de levá-las.
- Studio checar requisitos ao abrir (o mesmo verificador da SPEC-0738).
- Vendoring gravar a versão do engine em `vendor/cortex-game-engine/` para o MCP avisar quando a doc do
  Studio diverge da versão que o jogo compila.
