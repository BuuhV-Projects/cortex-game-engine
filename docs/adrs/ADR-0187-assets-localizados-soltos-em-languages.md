# ADR 0187 - Assets localizados moram soltos em `languages/` (export copia recursivo)

**Data:** 2026-08-04
**Status:** aceito

## Contexto

A SPEC-0124 estabeleceu que as traduções do jogo ficam em `languages/<código>.txt`
e que o export nativo as copia **soltas** pra `dist-native/languages/`, de
propósito fora do `assets.pak`: a promessa é "qualquer pessoa traduz abrindo o
`.txt`, sem rebuild".

Desde então apareceu conteúdo localizado que **não é texto**:

1. **Placas dos portais** — `languages/signs/<lang>/<levelId>.png`, geradas pelo
   `yarn signs` do jogo (o host nativo não tem `canvas`, então o texto da placa
   é rasterizado em build a partir do próprio `languages/<lang>.txt`).
2. **Dublagem** — a voz do locutor é gravada por idioma, e o jogo precisa
   escolher a faixa conforme o idioma ativo.

O export copiava de `languages/` apenas os arquivos `.txt` **da raiz**:

```js
for (const entry of fs.readdirSync(languagesDir)) {
  if (!entry.endsWith('.txt')) continue;
  fs.copyFileSync(...)
}
```

Subpasta era ignorada em silêncio. O efeito é a pior classe de bug do projeto:
**funciona no Studio e some no export** — em dev o Vite serve da raiz do projeto,
então `languages/signs/pt-BR/fase-1.png` carrega normalmente; no `dist-native/`
o arquivo simplesmente não existe. As placas dos portais já estavam nessa
situação antes deste registro.

O host **não** precisa de mudança: o `__cortexReadFile`
(`native/src/shims/files.cpp`) já tenta o `assets.pak` e, não achando, cai pro
arquivo solto em disco — é exatamente assim que os `.txt` funcionam hoje.

## Decisão

**`languages/` é copiado recursivamente pro export**, com tudo que houver
dentro — `.txt` na raiz e subpastas de assets localizados.

A cópia sai do corpo do `export-game.mjs` e vira o módulo irmão
`native/scripts/copy-languages.mjs`, exportando `copyLanguages(gameDir, dist)`.
Motivos: o `export-game.mjs` é um script de topo (roda ao importar) e portanto
não é testável direto; e a regra do `native/` é SOLID/arquivos pequenos
(PRD-0004, ADR-0100).

Fica valendo a convenção:

- **Asset localizado** (muda com o idioma) → `languages/<subpasta>/<lang>/…`,
  solto no dist e substituível sem rebuild.
- **Asset global** (igual em todo idioma) → `assets/…`, empacotado no
  `assets.pak`.

### Alternativa considerada: mover as subpastas pra `assets/`

Colocar `signs/` e as vozes em `assets/signs/<lang>/` resolveria o mesmo bug de
graça — o `assets/` já é empacotado recursivamente no `assets.pak`, sem tocar no
exportador — e ainda daria compressão e o XOR leve do container (ADR-0104).

Rejeitada porque **quebra a promessa da SPEC-0124**. Um tradutor que hoje abre o
`pt-BR.txt` e traduz o jogo inteiro não consegue regerar uma placa que está
dentro de um `.pak`: precisaria do repo do jogo, do Node e de um rebuild. Se o
texto é editável sem rebuild, a imagem daquele texto e a voz que o lê também
precisam ser — senão a localização fica pela metade e a placa continua em
português num jogo traduzido para o espanhol.

## Consequências

- **As placas dos portais passam a existir no export nativo.** Elas estavam
  faltando; nenhum outro ajuste é necessário porque o `__cortexReadFile` já faz
  fallback pro disco.
- **A dublagem por idioma tem onde morar** (`languages/voice/<lang>/`) sem
  depender de gambiarra no exportador.
- **O `dist-native/languages/` cresce e ganha subpastas.** Esse conteúdo fica
  solto: sem compressão e sem o XOR do `assets.pak`, portanto trivialmente
  extraível. É aceitável — é material de tradução, cuja substituição é
  justamente o recurso, não um vazamento.
- **Nada é filtrado por extensão.** Um arquivo de rascunho esquecido em
  `languages/` vai junto pro export. O critério passa a ser a pasta, não o
  sufixo — quem guarda material de trabalho deve deixá-lo fora de `languages/`.
- **Travado por teste** (`tests/native/copy-languages.test.ts`): subpasta
  aninhada é copiada, e a árvore de destino reproduz a de origem. O furo
  anterior era invisível ao CI porque nenhum teste exercitava esse trecho.
- Relaciona-se com SPEC-0124 (i18n + config.ini), ADR-0104 (assets.pak) e
  SPEC-0177 (contrato de empacotamento do export).
