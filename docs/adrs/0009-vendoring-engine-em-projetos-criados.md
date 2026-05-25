# 0009 - Vendoring do engine inline em projetos criados pelo IDE

**Data:** 2026-05-25
**Status:** aceito

## Contexto

Quando o IDE cria um projeto novo a partir de `templates/new-project/`, o projeto
precisa conseguir importar o engine (`import { GameLoop } from 'js-game-engine'`).
A primeira versão do template usava `"js-game-engine": "file:../../"` no
`package.json`, assumindo que o projeto seria criado dois níveis abaixo da raiz
do repo. Isso quebra em qualquer cenário real:

1. **IDE empacotado** (electron-builder em `Program Files/`) — o template é
   copiado para dentro do bundle, mas `file:../../` aponta para um diretório
   arbitrário no sistema do usuário.
2. **Projeto criado fora do repo** — o usuário escolhe `Documents/Jogos/`; o
   path relativo não tem nenhuma relação com onde o engine está.
3. **Projeto compartilhado/commitado** — qualquer um que clonar o projeto
   precisaria do engine no path correto.

Alternativas avaliadas:

| Opção | Prós | Contras |
|---|---|---|
| Publicar `js-game-engine` no npm | Idiomático; `npm install` resolve | Obriga publicar/versionar a cada mudança antes de testar no IDE |
| Embutir engine no app + apontar `file:` para path absoluto da instalação | Sem npm publish | Projeto criado fica acoplado à instalação do IDE — quebra se IDE for movido/desinstalado |
| **Vendor inline no projeto criado** | Projeto autocontido; sobrevive sem IDE; sem npm publish | Engine fica duplicado por projeto; atualizar engine não propaga |

Para um engine em iteração rápida onde o IDE é a forma esperada de criar
projetos, a duplicação é aceitável — basta regerar o projeto do template
quando o engine atualizar.

## Decisão

O IDE **vendoriza o engine inline** em cada projeto criado:

```
<projeto>/
├── vendor/
│   └── js-game-engine/
│       ├── index.js         # bundle ESM único (three.js embutido)
│       ├── index.d.ts       # agregador re-exportando core+ecs
│       ├── core/*.d.ts
│       └── ecs/*.d.ts
├── vite.config.ts           # resolve.alias 'js-game-engine' → ./vendor/js-game-engine/index.js
└── package.json             # sem dependência de js-game-engine
```

**Build do engine** (`yarn build:engine`):
1. `tsc -p tsconfig.engine.json` — gera `dist/src/**/*.d.ts` (só engine, sem
   tests/examples).
2. `vite build --config vite.engine.config.ts` — gera `dist-engine/index.js`
   (bundle ESM em library mode, com `three` embutido, sem AI/CLI que dependem
   de SDKs Node-only).

**Vendoring** (`fs:createProject` no main process):
1. Copia `templates/new-project/` para o destino, substitui `{{PROJECT_NAME}}`.
2. Copia `dist-engine/index.js` → `<projeto>/vendor/js-game-engine/index.js`.
3. Copia `dist/src/{core,ecs}/*.d.ts` → `<projeto>/vendor/js-game-engine/{core,ecs}/`.
4. Escreve `<projeto>/vendor/js-game-engine/index.d.ts` agregador.

**Empacotamento** (`electron-builder`): `dist-engine/` e `dist/src/**/*.d.ts`
são listados em `files` — vão pro `app.asar` do build final. `app.getAppPath()`
resolve corretamente em dev (raiz do repo) e prod (asar root).

**No editor do IDE**: além do vendoring no projeto, o `engine:readTypes` IPC
alimenta os mesmos `.d.ts` no Monaco TypeScript service (via `addExtraLib` +
`createModel`) para IntelliSense e Ctrl+click navegando para definições.
Também inclui os `.d.ts` reais de `@types/three` para resolver os tipos do
three usados pelo engine.

## Consequências

- Projeto criado roda com `yarn dev` (ou `vite`) sem precisar de `npm install`
  para resolver o engine — só Vite como devDep.
- Atualizar engine: usuário precisa regerar o projeto ou copiar o vendor
  manualmente. Aceitável dado o estágio do produto; revisitar se virar atrito.
- Bundle do engine pesa ~1 MB (gzip ~227 KB) embutido em cada projeto.
- AI (ScriptGenerator, BlenderModelGenerator) e CLI (jsgame-ai) **não** vão
  para o vendor — dependem de `@anthropic-ai/sdk` e `commander`, Node-only.
  São features de autoria do IDE, não do runtime do projeto.
- Substitui parcialmente [ADR-0007](0007-estrutura-electron-dentro-do-repo.md):
  a estrutura de build (`out/`, ESM, `dist-engine/`) divergiu do que estava
  registrado lá.
