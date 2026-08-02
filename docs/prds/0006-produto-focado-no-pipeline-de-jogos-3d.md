# PRD 0006 - Produto focado no PIPELINE de jogos 3D (substitui o PRD-0003)

**Data:** 2026-08-02
**Status:** aceito

Substitui o [PRD-0003](0003-engine-focado-em-plataforma-2-5d.md) (plataforma 2.5D).

## Problema

O PRD-0003 resolveu um problema real: o engine era **genérico demais**, sem alvo,
e cada sessão de level design partia do zero. A resposta foi escolher um gênero —
plataforma 2.5D estilo Mario Wonder / Rayman — e alinhar engine, template, editor
e IA nele.

O foco funcionou, mas o **eixo** estava errado. O que de fato tirou a
inconsistência não foi o gênero: foi o **caminho repetível** que nasceu depois —
kits de assets curados com vocabulário semântico (ADR-0053), skills que carregam o
método de montagem medido em fases reais (ADR-0180), validação geométrica
determinística antes de qualquer screenshot (ADR-0112) e um export nativo que leva
o jogo a PC/Steam/console (PRD-0004). Esse caminho **não depende do gênero**.

E a realidade andou: os jogos que hoje puxam o produto são 3D e de gêneros
diferentes — um obstacle course 3D pronto para a Steam (Cute Obstacle Rush, 4
mundos + extra), um farm sim 3D top-down 3/4 (Hearthvale), e a capacidade de mundo
aberto do PRD-0005 (M-perf-0..4 concluídos, ~70fps no host nativo). O engine
acompanhou: além de `setupPlatformer`, existem `setupThirdPerson`, `setupTopDown` e
`setupFirstPerson`; o catálogo tem 13 kits curados. Só o **posicionamento** ficou
para trás, e não era inofensivo: o system prompt do Chat IA ensinava o modelo a
montar 2.5D até o ADR-0180.

## Decisão de produto

**O produto se define pelo PIPELINE, não pelo gênero.** O norte é: *de um pack de
assets a um jogo 3D exportado, com o caminho todo coberto e verificável.*

```
kit bruto → kit curado (vocabulário + medidas) → cena data-driven → editor (F2)
          → validação (geométrica → visual) → export nativo (PC / Steam / console)
```

Cada etapa tem dono no repositório: `process-asset-kit`, `buildScene`+`kit.json`,
editor + Inspector, `validate_scene` + playtest, `export-game.mjs` + host nativo.
Um gênero novo entra escolhendo o `setup*` e os kits — não reescrevendo o caminho.

**3D é o padrão.** Câmera perspectiva, GLB, PBR, física 3D. 2.5D e 2D **não são
tipos de projeto**: são resultado do sistema de câmeras e da camada de render.

## Usuário e contexto

Desenvolvedor solo ou time pequeno que compra packs de assets e quer **chegar a um
jogo 3D exportável** sem escrever engine: sem física do zero, sem pipeline de
asset, sem ferramenta de nível própria, e delegando à IA do IDE a parte mecânica
da montagem. Quer decidir o design e revisar o resultado — não posicionar 1918
peças à mão nem descobrir na Steam que uma plataforma estava flutuando.

## Histórias do usuário

- **Como** dev, **quero** jogar um pack comprado no Studio e receber um kit curado
  (medido, tagueado, com thumbnails), **para** montar cena com peças que sei o que
  são e quanto medem.
- **Como** dev, **quero** pedir uma fase à IA e receber uma fase **validada**
  (geometria sem interpenetração/flutuação, percurso vencível), **para** revisar
  design em vez de caçar bug geométrico.
- **Como** dev, **quero** escolher o gênero pelo `setup*` (`setupThirdPerson`,
  `setupTopDown`, `setupPlatformer`, `setupFirstPerson`), **para** não reescrever
  controle e câmera a cada projeto.
- **Como** dev, **quero** que tudo que a IA gera seja **dado editável no editor**
  (cena JSON + overlay, física no nó), **para** manter o controle do meu jogo.
- **Como** dev, **quero** exportar para PC/Steam (e, no roadmap, console) a partir
  do mesmo projeto, **para** publicar sem porte manual.

## Escopo por versão

### V1 (o que já está de pé)

- **Pipeline de assets:** kits curados com `kit.json` (role/gameplayRole/tags/size/
  sockets/mechanic) — 13 kits no catálogo; skills `process-asset-kit` (3D, Blender)
  e `process-asset-kit-2d` (sprites).
- **Gêneros por setup:** `setupThirdPerson`, `setupTopDown`, `setupPlatformer`,
  `setupFirstPerson`, com física 3D (Rapier) e character controller.
- **Cena como dado:** `scenes/*.json` + `buildScene`, overlay do editor, física
  declarada no nó e editável no Inspector.
- **Método na IA:** skills e subagente `level-builder` entregues como plugin
  (ADR-0180); validação em camadas — `validate_scene` (0 erros) → visual.
- **Export nativo:** host próprio (Hermes + wgpu + SDL3), PC e Steam operacionais
  (PRD-0004); capacidade open-world M-perf-0..4 (PRD-0005).

### V2 (próxima iteração)

- Fechar a lacuna entre "fase gerada" e "fase divertida": playtest de *feel*
  (alcance de pulo, timing de hazard) menos dependente do olho do usuário.
- Kits com mecânicas de gameplay embutidas (o `mechanic` do `kit.json`) cobrindo
  mais gêneros que obstáculo — fazenda, exploração, combate.
- Console (M3/M4 do PRD-0004).

### V3+ (não-bloqueante)

- Multiplayer/rede, streaming de cena além do que o open-world exige, editor de
  curvas de game feel.

## Critérios de sucesso

- Um pack comprado vira kit curado utilizável **sem edição manual de metadado**.
- Uma fase pedida à IA sai com **0 erros de `validate_scene`** e vencível no
  playtest, em qualquer um dos gêneros suportados.
- Trocar de gênero é trocar o `setup*` e os kits — sem tocar em física, editor ou
  pipeline de export.
- O mesmo projeto exporta para PC/Steam sem porte manual.

## Não-objetivos

- **Não** voltar a ser "engine genérico sem caminho": o caminho é o produto. Um
  gênero só é suportado quando cabe no pipeline (kit → cena → validação → export).
- **Não** perseguir paridade de features com Unity/Unreal.
- **Não** entregar 2D pixel art como caminho principal (existe, via câmera
  ortográfica + sprites + tilemap, mas não guia o roadmap).

## Sobre o 2.5D (o que muda para quem já usa)

**Continua suportado, sem ser o foco.** As primitivas do PRD-0003 —
`setupPlatformer`, `Collider2DComponent`, `PlatformerBodyComponent`,
`PlatformerPhysicsSystem`, `FollowCamera2DSystem` — **ficam e seguem mantidas**:
2.5D é resultado da câmera sobre a mesma base 3D, então o custo de manter é baixo e
há jogo ativo em cima disso (dream-island-wonder, plataform-25d).

O que o 2.5D deixa de fazer é **guiar** template, IA e roadmap. Em concreto: o
system prompt do Chat IA não ensina mais a montar 2.5D por padrão (ADR-0180), e o
V2 do PRD-0003 (inimigos/coletáveis/zonas de câmera/tilesets **como primitivas de
plataforma**) sai do roadmap — o que for feito nessa linha vem por kit e por skill,
como em qualquer outro gênero.
