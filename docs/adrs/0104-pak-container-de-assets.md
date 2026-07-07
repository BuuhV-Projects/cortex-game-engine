# 0104 - Container de assets ".pak" no export nativo

**Data:** 2026-07-07
**Status:** aceito

## Contexto

O export nativo (ADR-0101) copiava a pasta `assets/` inteira — centenas de
arquivos soltos (GLBs, áudio, texturas, JSONs) ao lado do exe. Qualquer um abre
a pasta e extrai/reusa os assets. O usuário levantou a preocupação de segurança.

Realidade do gamedev: **nenhum** engine protege assets de verdade — Unity
(AssetStudio), Unreal (FModel), Godot (.pck) são todos extraíveis, porque o jogo
precisa descriptografar em runtime e a GPU vê o dado cru. Criptografia "forte" é
falsa sensação de segurança (a chave vai no binário) e custa perf. O padrão
proporcional é **empacotar num container** (afasta a extração casual) e deixar a
proteção REAL pro nível da plataforma (no Xbox, o pacote GDK/XVC é criptografado).

## Decisão

Um container **`.pak`** (formato próprio "CXP1") que junta a pasta `assets/` num
arquivo único, com um **XOR leve** (barreira anti-casual, NÃO criptografia). O
host lê dele de forma **transparente**; no dev os arquivos ficam soltos.

Formato (little-endian) — `native/scripts/pak.mjs` (writer) e
`native/src/shims/pak.cpp` (reader), que precisam ficar EM SYNC:
```
[0]  magic "CXP1" (4)
[4]  indexOffset (u32)   [8] indexSize (u32)   [12] flags (u32; bit0 = XOR)
[16] blob de dados (arquivos concatenados)
[indexOffset] índice: count(u32) + count× [pathLen u16][path utf8][offset u32][size u32]
```
XOR: todo byte de 16..EOF = `raw ^ KEY[(pos-16) % 32]` (header fica cru). A chave
(32 bytes) é a MESMA nos dois lados. Limite de 4 GB por pak (offsets u32).

- **Export** (`export-game.mjs`): `packDir(assets/, dist/assets.pak, 'assets/')`
  no lugar do `cpSync` — some a pasta solta, vira 1 arquivo (sob `guardLocks`).
- **Host** (`files.cpp`): `registerFiles` chama `loadPak(baseDir + 'assets.pak')`;
  o `__cortexReadFile(path)` tenta o pak primeiro (chave = path normalizado com
  '/') e cai pro arquivo solto se não achar (dev/console) — o jogo não muda.
- Cenas (JSON) + `cortex.json` seguem soltos (config pequena).

## Consequências

- **Assets não ficam mais soltos**: 1 `assets.pak` (ex.: 91 MB, 167 arquivos no
  teste4) em vez de centenas de arquivos abríveis; conteúdo/paths embaralhados
  (não aparecem em `strings`/hex). Extração casual travada; determinada, não —
  e tudo bem (é o padrão).
- **Transparente**: o jogo continua usando `fetch('assets/...')`; dev roda com
  soltos, export com o pak. Validado no teste4 (cena idêntica lendo do pak).
- **Sync de dois lados**: writer (mjs) e reader (cpp) compartilham formato + chave
  — mudar um exige mudar o outro. Teste de round-trip em `tests/native/pak.test.ts`.
- **Não é segurança real**: XOR é reversível; a chave está no exe. Proteção de
  verdade vem da plataforma (Xbox/GDK criptografa o pacote). Documentado como tal.
- **Limites**: 4 GB por pak (u32); assets soltos ainda funcionam se o pak faltar.
