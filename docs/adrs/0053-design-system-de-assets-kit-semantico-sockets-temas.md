# 0053 - Design system de assets: kit semântico, sockets e temas

**Data:** 2026-06-07
**Status:** aceito (implementado: §1 kit.json + §2 attach + §6 role/gameplayRole no
engine e no Chat IA; pendente: §3 tokens de tema, patterns/setpieces)

## Contexto

O norte do projeto é "a IA é a level designer — levels bonitos E jogáveis"
([[chat-ia-scene-building]]). Já temos três das quatro camadas que isso exige:

- **Percepção** — `inspect_assets` (ADR-0037) dá olhos à IA: thumbnail + bbox por
  `.glb`.
- **Teoria** — a Game Design Bible (`docs/game-design-bible/`) dá as regras de
  design (pacing, jumpability, gênero), injetada no system prompt.
- **Construção** — cena data-driven JSON (ADR-0044) + `place`/grounding (ADR-0039)
  + collider autorável (ADR-0047/0049).

Falta a **quarta camada: vocabulário**. Hoje a IA vê que `bridge_001.glb` mede
12×2×3, mas não *sabe* que é um conector cujo deck precisa alinhar ao topo de duas
ilhas — ela **infere** isso de um thumbnail, a cada sessão, sob pressão de
contexto. O próprio ADR-0037 já registra esse risco nas consequências ("instruções
de prompt orientam, mas não garantem adesão").

A analogia que motivou esta decisão (discutida com o usuário) é o **Lovable**: ele
não produz sites bonitos por ter um LLM mais esperto, e sim por **restringir** o
LLM a um vocabulário curado — shadcn (peças já bonitas) + design tokens do Tailwind
(paleta/escala) + composição por relações (flexbox), em vez de CSS inventado. O
LLM vira um **montador de peças conhecidas**. O teto cai um pouco; o **piso sobe
muito** — exatamente o trade que serve a "levels bonitos de forma confiável".

Dois problemas concretos que isso resolveria no engine:

1. **Conexão X/Z é raciocínio frágil.** Hoje a Bible manda a IA *bakear*
   `x = (ilhaA_centro + larguraA/2 + …)/2` a partir do bbox. O `place` já tornou o
   grounding (eixo Y) **determinístico** e matou o bug "peça flutuando"; o eixo X/Z
   continua sendo matemática chutada na autoria — daí "ponte boiando no vão".
2. **Semântica é re-derivada toda sessão.** O papel de cada asset (chão? conector?
   hazard?) vive só na cabeça do modelo olhando o thumbnail, não persiste.

## Decisão

Introduzir uma camada de **design system de assets** sobre o que já existe, em
fases incrementais e **retrocompatíveis** (todos os campos novos são opcionais; as
cenas JSON atuais com `place`/coords bakeadas seguem funcionando).

### 1. Manifesto do kit (`assets/kit.json`) — o vocabulário persistente

Um arquivo ao lado dos assets que tagueia cada `.glb` com **papel + metadados +
âncoras**. É a memória semântica do pacote (vs. `inspect_assets`, que é percepção
efêmera). Schema novo em `src/scene/` (zod, no padrão do `SceneDefinition`):

```jsonc
{
  "version": 1,
  "name": "floating-islands-forest",
  "module": 2,                 // unidade de grid/snap (a "escala de espaçamento")
  "theme": "golden-hour-forest",
  "assets": {
    "land_001.glb": {
      "role": "ground",
      "tags": ["forest", "L"],
      "size": [12, 3, 8],                       // bbox cacheado do inspect_assets
      "collider": { "shape": "heightfield", "solid": true },
      "anchors": {
        "top":        { "at": [0, 3, 0],  "kind": "surface", "dir": [0, 1, 0] },
        "edge_right": { "at": [6, 3, 0],  "kind": "connect", "dir": [1, 0, 0] },
        "edge_left":  { "at": [-6, 3, 0], "kind": "connect", "dir": [-1, 0, 0] }
      }
    },
    "bridge_001.glb": {
      "role": "connector",
      "collider": { "shape": "heightfield", "oneWay": true },
      "anchors": {
        "a": { "at": [-2.5, 0, 0], "kind": "connect", "dir": [-1, 0, 0] },
        "b": { "at": [ 2.5, 0, 0], "kind": "connect", "dir": [ 1, 0, 0] }
      }
    }
  }
}
```

- **`role`** (enum): `ground | platform | connector | prop | hazard | collectible
  | decoration | cap | tile | player-start`. Cada papel carrega um **preset de
  collider** default (plataforma flutuante → `oneWay`; chão → `solid`),
  reaproveitando o `ColliderConfig` que já existe no `SceneDefinition`.
  **Precedência:** um `collider` explícito no nó/JSON vence o preset do `role`
  (mesma regra "definido no código vence" do editor, ADR-0047).
- **`anchors`**: pontos de conexão em espaço LOCAL. `kind: connect` (encaixe de
  borda) ou `surface` (pousar em cima). `dir` é a normal de saída — dois `connect`
  se acoplam quando suas `dir` são opostas.

### 2. Placement por socket no `SceneNode` — o análogo do `place` para X/Z

Campo opcional novo nos nós `model`/`primitive` do `SceneDefinition`:

```jsonc
{ "type": "model", "id": "ponte_1", "url": "assets/bridge_001.glb",
  "attach": { "socket": "a", "to": "ilha_1", "toSocket": "edge_right" } }
```

O `buildScene` resolve numa **passada determinística e ordenada por dependência**
(resolve `ilha_1` antes de `ponte_1`): computa o transform de modo que o socket
`a` de `ponte_1` coincida com a âncora `edge_right` de `ilha_1` (posição + as `dir`
se encaram). A IA passa a **declarar a relação**, não chutar a coordenada — o que o
`place` fez pelo Y, `attach` faz pelo X/Z. O `buildScene` continua sendo o único
ponto de instanciação (ADR-0044), então a resolução entra como um passo a mais ali.
**Modo de falha:** socket inexistente ou ciclo de `attach` → **falhar alto** (parse
retorna `null` / build lança), no padrão do `parseSceneDefinition` — nunca silenciar
numa pose chutada.

### 3. Temas nomeados — os design tokens do mundo

O `theme` do kit empacota paleta + atmosfera (o que já temos avulso:
`background`/`fog`/`outdoorLighting` + preset de `PostFX`) sob um nome. A
`SceneDefinition` referencia `"theme": "golden-hour-forest"` em vez de inlinear 30
hex. A IA escolhe um *mood*, não calibra luz à mão. A Bible passa a referenciar
nomes de tema por bioma/gênero.

### 4. Produção do manifesto — ~70% automático, resto tag única

Estender o pipeline Blender do `inspect_assets` (ADR-0037) para **derivar e
cachear** no `kit.json` o que dá pra inferir geometricamente: `size` (bbox),
size-class (`S/M/L`), âncora `top` (centro da face superior), candidato a
`connector` (forma plana, estreita e comprida). O **`role` semântico** e o
ajuste fino de sockets continuam sendo uma tag — feita **uma vez** pelo agente
(LLM) durante a inspeção e **persistida** no `kit.json`. Depois disso, vira
conhecimento estável, não re-derivado por sessão.

### 5. Prompt / engine-api / Bible

O agente passa a: ler `kit.json` (semântica) em vez de re-inferir tudo do
thumbnail; autorar com `attach` (sockets) no lugar de coordenadas bakeadas;
escolher um `theme`. Atualizar `AGENT_SYSTEM_PROMPT`, o guia curado
`engine-api.md` (injetado no prompt) e as `ai-rules` da Bible. Rodar
`yarn docs:engine` ao mexer na API pública.

### 6. Camada semântica de composição — intenção, não geometria

O `role` (seção 1) diz o que o asset **é** fisicamente; falta o que ele **serve**
dentro de uma cena. É a mesma lição do shadcn (`Button → Form → Dashboard`): o
agente raciocina por intenção, não por peça isolada. Modelamos isso como **três
eixos ortogonais** por asset — de propósito, pra não recriar taxonomias que se
sobrepõem:

- **`role`** — natureza física (enum fechado): `ground`/`connector`/`prop`/… (seção 1).
- **`tags`** — identidade temática/bioma, **já existe na seção 1** (`forest`,
  `village`, `ruins`, `S/M/L`).
- **`gameplayRole`** (NOVO) — função de design, de um vocabulário canônico:
  `guidance | reward | challenge | safe-zone | landmark | cover | resource | path`.

```jsonc
"tree_001.glb": { "role": "decoration", "tags": ["forest"], "gameplayRole": ["cover", "guidance"] }
```

> Descartado um quarto eixo "semanticRoles" (`forest`/`village` = tema; `landmark`/
> `cover` = função): ele duplicava o `tags` **e** o `gameplayRole`. Dois nomes pro
> mesmo conceito viram taxonomia que apodrece — daí os três eixos ortogonais.

**O vocabulário é kit-independente.** O *conjunto* de `gameplayRole` (e o vocabulário
recomendado de `tags`) vive na **Bible/engine**, não dentro de cada `kit.json` — só
a *marcação por asset* é por-kit. É isso que torna "novos kits reusam o mesmo
vocabulário" verdadeiro (benefício que se perde se a taxonomia mora em cada pack).

**Bible referencia função, não asset** (aprofunda a seção 5 — é o ganho central da
camada): "coloque árvores perto da ponte" vira "crie uma zona de `guidance`";
"castelo ao fundo" vira "um `landmark` visível do hub". Desacopla as regras de
design dos assets concretos do pack.

**Patterns / setpieces — adiado, vocabulário e não instanciação.** Composições
recorrentes (`forest_cluster`, `village_core`, um acampamento) são vocabulário de
alto nível útil, mas ficam para **fase posterior**, com dois ajustes sobre a ideia
original:
1. **`requires` por role/tag/gameplayRole, não por nome de asset** — senão o pattern
   gruda num pack e perde a portabilidade que o justifica.
2. **Renomear `scenes`** — colide de frente com `SceneDefinition`/`scenes/*.json`
   (que já significa "arquivo de cena" no engine). Usar `setpieces` (ou `locales`).

Não codificar a taxonomia de patterns no abstrato: **shippar a marcação por asset
primeiro** (barato, aditivo) e deixar **packs reais** revelarem quais composições de
fato recorrem — só então virar dado. Taxonomia inventada antes do uso é bikeshed que
não embarca.

## Consequências

- **Conexão vira estrutural, não raciocínio.** Sockets matam "ponte boiando" do
  mesmo jeito que `place` matou "peça flutuando". O resolver de `attach` é
  matemática de transform **pura → unit-testável** (ao contrário da derivação via
  Blender, que herda o caveat do ADR-0037 de não ser testável sem o binário real).
- **Curadoria importa tanto quanto o metadado.** Metade da beleza do Lovable é o
  shadcn já ser bonito; asset incoerente → cena feia, com ou sem manifesto. O
  design system pede, em paralelo, **kits temáticos de primeira-parte** (ou packs
  abençoados) onde a arte cohere. O trabalho da IA encolhe de "deixe bonito" pra
  "monte certo estas peças bonitas".
- **Custo de autoria do manifesto**, mitigado pela derivação automática (~70%) +
  cache; a tag de `role`/socket é única por kit e estável depois.
- **Risco de over-engineering na semântica.** Patterns/setpieces e taxonomias amplas
  são sedutores e podem virar bikeshed que nunca embarca. Por isso a ordem é fixa:
  `role`/`tags`/`gameplayRole` **por asset primeiro** (barato, aditivo); patterns
  depois, **dirigidos por packs reais**, não inventados no abstrato. O vocabulário
  canônico mora na Bible/engine (kit-independente), só a marcação é por-kit.
- **Trade de criatividade:** piso sobe, teto cai um pouco — alinhado ao norte
  ("bonito de forma confiável"). Quem quiser fugir do kit ainda pode usar `place`/
  `transform` crus (retrocompat).
- **Não colapsa o problema como no web.** DOM/flexbox é 2D e perdoador; aqui há
  física e jumpability. O design system reduz muito, mas o loop de validação
  (`playtest_game` ADR-0033, `critique_scene` ADR-0043) continua necessário no fim.
- **Incremental e retrocompatível:** `kit.json`, `attach` e `theme` são todos
  opcionais; nada quebra cenas existentes. Dá pra entregar a Fase 1 (manifesto)
  sem a Fase 2 (sockets).
- **Vendoring/build:** schema e resolver vão pro bundle vendorizado e seus `.d.ts`
  (re-vendorizar nos projetos que consomem o engine, ex. [[dream-island-wonder]]).
  Atualizar `engine-api.md` e `docs:engine`.
- Relaciona-se com ADR-0037 (inspect_assets = percepção; aqui vira persistência
  semântica), 0044 (SceneDefinition = construção; ganha `attach`), 0039 (grounding,
  do qual sockets são o análogo X/Z) e a Game Design Bible (teoria; passa a
  referenciar `role`/`theme`).
