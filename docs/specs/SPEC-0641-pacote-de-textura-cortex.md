# SPEC-0641 - Pacote de textura da Cortex: manifesto, import no Studio e export

**Data:** 2026-10-31
**Status:** aceito · decisão em ADR-0640

## Contexto

ADR-0640 decide: um repo GitHub por pacote, binários num zip de Release, fonte PNG/JPG,
instalado em `assets/packages/<id>/`. Esta spec define o formato e os fluxos.

## Decisão

### 1. Repositório do pacote

```
cortex-yughues-ground-textures/          (git: só o leve)
├── cortex-package.json                  manifesto
├── README.md                            lista de materiais + miniaturas
├── NOTICE                               licença e crédito do autor original
└── previews/<material>.jpg              256², pro README
Release v1.0.0 (assets):
├── cortex-package.json                  o MESMO do repo, com `archive.sha256` — o Studio
│                                        lê o checksum por aqui (público ou privado)
└── cortex-yughues-ground-textures-1.0.0.zip
    ├── cortex-package.json              sem `archive` (o zip não pode conter o próprio hash)
    └── materials/<material>/{color.jpg, normal.png, roughness.png, emissive.jpg?, opacity.png?}
```

### 2. Manifesto `cortex-package.json`

```json
{
  "schema": 1,
  "id": "cortex-yughues-ground-textures",
  "kind": "textures",
  "name": "Yughues — Ground",
  "version": "1.0.0",
  "license": { "spdx": "LicenseRef-Unity-Asset-Store-EULA", "redistributable": false,
               "attribution": "Yughues (Nobiax)", "source": "Unity Asset Store" },
  "archive": { "file": "cortex-yughues-ground-textures-1.0.0.zip", "sha256": "…", "bytes": 0 },
  "materials": [
    { "id": "grass01", "name": "Grass 01", "tags": ["grass", "ground"],
      "size": 1024, "tiling": 4,
      "maps": { "color": "materials/grass01/color.jpg", "normal": "materials/grass01/normal.png",
                "roughness": "materials/grass01/roughness.png" } }
  ]
}
```

Validado por schema zod (`src/io/packages/manifest.ts`); `maps.color` é obrigatório, exceto em
material só emissivo (Lava) que exige `emissive`. Mapa ausente na fonte (ex.: Snow só tem normal)
→ material marcado `incomplete: true` e fora do picker por padrão.

### 3. Conversão Unity → Cortex (`D:/ai-scripts/cortex-textures/`, fora da engine)

Fonte: shader Standard (Specular setup, `fileID 45`) dos `.mat`.
- `_d` → `color.jpg` (q90, sRGB). Alfa de `_d` (Permeable01/02) → `opacity.png` se não for todo 255.
- `_n` → `normal.png` (OpenGL/+Y, igual ao Unity; sem inversão).
- `_s` (RGB specular + A smoothness) → `roughness.png` = `255 − A` em cinza; metalness = 0.
- `_e` → `emissive.jpg`. Preview/lightmaps/`.unitypackage`/`.fbx`/cena de demo: descartados.
- Nome do material vem do `.mat` (não do arquivo de textura); o Cobble, cujos nomes são só números, vira `cobble01`…`cobble13`. Zip determinístico (ordem e datas fixas): reconverter dá o mesmo SHA-256. Sai um repo git local por pacote em
  `D:/＠buuhvprojects/cortex-textures/packages/<id>/` + o zip em `dist/`.

### 4. Declaração e import no projeto

`cortex.json`: `"packages": { "cortex-yughues-ground-textures": "1.0.0" }` (versão exata;
opcional `"repo": "<owner>/<nome>"`, default = org Cortex).

Studio (processo principal, `electron/packages/`):
1. Lê `cortex.json#packages`; já instalado na versão pedida (manifesto em
   `assets/packages/<id>/` + lock) = no-op. Com lock, tenta o cache
   `%LOCALAPPDATA%/cortex/packages/<id>/<versão>.zip` (SHA do lock confere → sem rede).
2. Baixa o asset `cortex-package.json` do release (SHA esperado) e o zip. Downloaders em ordem:
   HTTPS público `https://github.com/<owner>/<id>/releases/download/v<versão>/<arquivo>`; 404 →
   `gh release download v<versão> -R <owner>/<id> -p <arquivo>` (repo privado; a autenticação é
   do `gh`, o Studio nunca lê token). Nenhum achou → erro pedindo `gh auth login`.
3. SHA-256 do zip tem que bater com o release E com o lock (se houver — release republicado
   com outro conteúdo é recusado). Extrai em `<id>.tmp-<pid>` (leitor de zip próprio,
   `electron/packages/zipReader.ts`, recusa caminho com `..`/absoluto), confere id/versão do
   manifesto interno e troca pela pasta final. Grava `cortex-packages.lock.json`
   (`{ id: { version, sha256 } }`) e o zip no cache.
4. UI: botão "Pacotes de textura…" no modal Configurações do jogo → `PackagesModal` (lista com
   estado instalado e aviso de licença não redistribuível, Adicionar id + versão, Remover,
   Instalar faltantes, progresso via `packages:progress`). `project:setActive` (abrir projeto)
   instala sozinho o que falta, em segundo plano.
5. Template novo: `.gitignore` ganha `assets/packages/`.

### 5. Editor / Inspector

`/__list-assets` passa a listar também os `cortex-package.json`. Os arquivos de
`assets/packages/` saem das listas soltas de imagem (senão apareceriam dezenas de `color.jpg`
iguais); `src/editor/packageTextures.ts` lê cada manifesto e o seletor de textura do terreno
(`EditorTexturePicker`, ADR-0073) ganha **um item por material** — nome `"<pacote> · <material>"`,
thumb e valor = URL da cor (o splat do terreno, SPEC-0063, só usa a cor por camada). Materiais
incompletos/só emissivos ficam fora. `packageMaterialPicks` também devolve `normal`/`roughness`
pra quem aceitar material completo (follow-up: material PBR em nó/estrada).

### 6. Export (só o que o jogo usa)

`cook-assets.mjs`: para arquivos sob `assets/packages/`, inclui só os referenciados — busca de
cada caminho relativo (`packages/<id>/materials/<m>/…`) nas cenas, overlay (`data/*.json`) e no
código do jogo (`.json/.ts/.js…`, sem `node_modules`/`vendor`/`assets`/`dist*`) —
`native/scripts/package-usage.mjs`. Citar qualquer mapa leva a pasta INTEIRA do material (a
normal/roughness acompanham a cor). Os demais, e os `cortex-package.json`, não entram no `.pak`. Arquivos referenciados seguem o cook normal
(hoje PNG/JPG soltos vão crus; KTX2 de soltas é follow-up do ADR-0108). `CORTEX_EXPORT_ALL_PACKAGES=1`
desliga o filtro (diagnóstico). Com `CORTEX_NO_COOK=1` (debug) o pak leva `assets/` cru, pacotes
inteiros inclusive.

### 7. Licença (bloqueio de publicação)

Os 3 pacotes vieram da **Unity Asset Store** sem arquivo de licença próprio → regidos pelo
EULA padrão da Asset Store: uso dentro do jogo ok, **redistribuição dos assets avulsos não**.
Logo: repos **privados** (`license.redistributable: false`); o modal de Pacotes mostra o aviso e a
publicação (script de release) recusa repo público para `redistributable: false`. Repo público só
para pacotes com licença que permita (CC0/CC-BY etc.), com `NOTICE` de atribuição.

## Consequências

- Testes: schema do manifesto, resolução/verificação de hash do instalador (fetch mockado),
  filtro do cook (só referenciados), item de picker por material.
- Docs: `architecture.md` (seção build/vendoring e editor) e `engine-api.md` se a API pública mudar.
- Fora de escopo: KTX2 de texturas soltas no cook, pacotes de modelo/áudio, registry/listagem
  remota de pacotes disponíveis.
