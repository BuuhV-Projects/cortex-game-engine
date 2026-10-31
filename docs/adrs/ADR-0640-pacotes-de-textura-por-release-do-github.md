# ADR-0640 - Pacotes de textura importáveis: repo GitHub por pacote, binários no Release

**Data:** 2026-10-31
**Status:** aceito

## Contexto

As texturas dos jogos hoje vivem dentro do template (`templates/new-project/assets/textures/`:
grass, dirtgrass, forest-floor, sand-beach, cliff, com `_normal`). O usuário quer usar bibliotecas
maiores — a primeira são os três pacotes Yughues (Cobble, Ground, Pavements, 64 materiais, 677 MB
em TGA) em `cortex-textures/unity-original` — sem pôr isso no repo da engine nem no template.
O modelo desejado é o do Unity Package Manager: cada pacote de textura é um módulo versionado
num repositório do GitHub da Cortex, que o projeto declara e o Studio importa.

Duas decisões com alternativas reais:

**1. Onde ficam os binários do pacote.**

| Opção | Prós | Contras |
|---|---|---|
| Git puro (texturas commitadas) | Simples, um `git clone` | Arquivo > 100 MB é recusado pelo GitHub; cada versão nova soma ao histórico pra sempre; clonar baixa todas as versões |
| Git LFS | Histórico leve, "git normal" pro autor | Cota de armazenamento E de banda da conta (estoura com uso/CI; cobrado depois); exige `git lfs` instalado em quem baixa; Studio teria que embutir/depender do git-lfs |
| Git submodule no projeto | Pinado por commit, nativo do git | Exige git no usuário; traz o pacote inteiro (todas as texturas) pro projeto; submodule é atrito conhecido (clone recursivo, detached HEAD); herda o problema de tamanho de uma das linhas acima |
| **Asset do GitHub Release (zip por versão)** | Sem cota de banda/armazenamento por repo (limite é 2 GiB por arquivo); download único por HTTP, sem git no usuário; versão = tag; checksum verificável; histórico do repo fica pequeno | Binário não versiona "dentro do git" (o zip é gerado pelo script e anexado); repo privado exige autenticação no download |

**2. Formato das texturas dentro do pacote.**

| Opção | Prós | Contras |
|---|---|---|
| KTX2/Basis no pacote | Menor em disco | O Studio renderiza a FONTE e só o host nativo lê KTX2 (ADR-0108: `loadKtx2` é native-only, o caminho browser foi removido); quebraria o picker/preview e o fluxo fonte→cook |
| **PNG/JPG no pacote (fonte), KTX2 no export** | Igual ao resto do projeto: o Studio usa a fonte, o `cook-assets` converte no export com cache (ADR-0108/0119) | Pacote maior que em KTX2 |

## Decisão

1. **Um repositório GitHub por pacote**, nome `cortex-<autor>-<tema>-textures`
   (ex.: `cortex-yughues-ground-textures`). O git guarda só o pequeno: `cortex-package.json`,
   `README.md`, `LICENSE`/`NOTICE` e `previews/` (miniaturas 256² JPG). As texturas em tamanho
   cheio vão num **zip anexado ao Release** da tag `vX.Y.Z` (`<id>-X.Y.Z.zip`), com o SHA-256
   no manifesto da release. Sem LFS, sem submodule, sem npm.
2. **Formato no pacote = fonte do projeto:** cor em **JPG q90** (sRGB), normal em **PNG RGB**,
   roughness em **PNG cinza** (derivado do specular Unity), emissive em JPG quando houver.
   Resolução **original** (1024², uma em 2048²) — o export já cozinha KTX2 UASTC+Zstd. Medido
   numa amostra de 8 materiais: TGA 81 MB → 21 MB (~26%); projeção dos 3 pacotes ~170 MB.
3. **Instalação no projeto em `assets/packages/<id>/`**: entra de graça no `/__list-assets`,
   no servidor do Vite e no `EditorTexturePicker` (ADR-0073), sem caminho novo de URL.
   O projeto declara a dependência em `cortex.json#packages` e o Studio grava um
   `cortex-packages.lock.json` com versão + SHA-256. `assets/packages/` vai no `.gitignore` do
   jogo (é reconstruível pelo lock), como `node_modules`.
4. **Export leva só o usado**: o cook ignora arquivos de `assets/packages/` que não forem
   referenciados pela cena/overlay/código do jogo (detalhe na SPEC-0641).
5. **Download** pelo processo principal do Electron: repo público → HTTPS direto da URL do
   asset; repo privado → `gh release download` (a autenticação é do `gh` do usuário; o Studio
   nunca lê nem guarda token). Cache global por versão em `%LOCALAPPDATA%/cortex/packages/`.

## Consequências

- Engine e template ficam leves; a biblioteca cresce sem tocar neles.
- Publicar versão nova = rodar o script de conversão, criar tag e anexar o zip (o script faz).
- Repos **privados** só funcionam para quem tiver `gh` autenticado com acesso — aceitável enquanto
  a licença não permitir repo público (ver SPEC-0641 §Licença: os Yughues da Asset Store não
  permitem redistribuição pública).
- O caminho fica aberto para outros tipos de pacote (modelos, áudio) com o mesmo manifesto
  (`kind`), mas esta decisão cobre só `kind: "textures"`.
- Ver SPEC-0641 para formato do manifesto, fluxo de import, Inspector e export.
