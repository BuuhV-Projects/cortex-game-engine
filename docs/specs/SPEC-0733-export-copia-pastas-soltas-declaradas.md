# SPEC 0733 - Export copia as pastas soltas declaradas pelo jogo

**Data:** 2026-11-14
**Status:** implementado

## Contexto

Decisão em ADR-0732: o jogo declara em `cortex.json.looseDirs` as pastas que o
export nativo deve copiar soltas, fora do `assets.pak`. Antes só `languages/`
era copiada (SPEC-0124, ADR-0187).

## Decisão

### Formato

`cortex.json` do projeto:

```json
{ "looseDirs": ["radios", "mods/maps"] }
```

- Opcional. Ausente = só `languages`.
- Lista de strings, cada uma um caminho **relativo à raiz do jogo**. Aceita `/`
  ou `\` e subpasta (`mods/maps`). O destino no dist é o mesmo caminho.
- `languages` entra sempre, declarado ou não; repetições são ignoradas.

### Validação (reprova o export)

O export para com erro, antes de copiar, quando `looseDirs`:

- não é lista; ou tem item que não é string, é vazio, é absoluto (`/x`, `C:\x`,
  `C:x`), ou tem segmento `..` (ou `.` como caminho inteiro).

### Cópia

`native/scripts/copy-loose-dirs.mjs`:

- `looseDirsOf(config)` → lista validada e normalizada (`/`), começando por
  `languages`. Lança `Error` com o item inválido.
- `copyLooseDirs(gameDir, dist, dirs)` → copia cada pasta recursivamente, sem
  filtro de extensão, sobrescrevendo o destino; pasta ausente é pulada. Devolve
  `{ dir, files }` por pasta copiada (o export loga `[export] <dir>: N arquivos`).
- `copyLanguages(gameDir, dist)` (ADR-0187) continua no mesmo módulo (que era
  `copy-languages.mjs`), sobre o mesmo copiador.

`looseDirs` não vai para o `cortex.json` do dist.

### Leitura no host

Sem mudança: `__cortexReadFile` tenta o pak e cai para `<pasta do exe>/<caminho>`
para qualquer caminho relativo.

## Consequências

- Testes: `tests/native/copy-loose-dirs.test.ts` (validação + cópia) e
  `tests/native/copy-languages.test.ts` (comportamento antigo).
