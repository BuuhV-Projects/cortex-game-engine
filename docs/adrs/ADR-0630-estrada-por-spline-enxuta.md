# ADR-0630 - Estrada por spline volta à engine, enxuta

**Data:** 2026-10-31
**Status:** aceito — substitui em parte o [ADR-0089](0089-remocao-road-e-kit.md) (só a parte da Road; o Kit continua removido)

## Contexto

O ADR-0089 removeu a estrada por spline (ADR-0072/0075/0076/0087/0088) porque ela não tinha dono: o DDD-61 passou
a modelar a cidade no Blender. Quatro meses depois apareceu um dono. O Port Hollow (`D:/jogos/port-hollow`, PRD-0002
do jogo, seção "Serras com a ferramenta de terreno") precisa de uma estrada que suba uma serra, cortando e aterrando
o terreno, que o usuário desenhe e ajuste no editor F2. O menu do Studio ainda mostrava "Desenhar estrada" e o item
não fazia nada.

O PRD do jogo comparou duas saídas:

| alternativa | prós | contras |
|---|---|---|
| **(a) reintroduzir na engine, enxuta** | desenho e ajuste no F2; a estrada é dado da cena (overlay vence), editável no Inspector, como manda a regra "física = dado da cena"; serve outros jogos; conserta o menu órfão | 3 a 5 dias; a engine mudou (SceneBuilder, overlay, merge estático, renderer nativo, terreno sem `roadDelta`) |
| (b) gerar a fita e o corte no jogo | 2 a 3 dias; nada muda na engine | a curva só muda no arquivo de dados; sem ferramenta no Studio; o corte vira cicatriz no heightmap gerado |

Dentro da (a) havia ainda uma escolha de escopo: trazer de volta o sistema inteiro do ADR-0087 (perfis de via com
calçada e meio-fio, cruzamentos, `navGraph`, `RegionSpec`, marcações, catálogo de 63 MB de texturas) ou só o núcleo.

## Decisão

**(a), só o núcleo.** O usuário escolheu a (a). Volta:

1. **Spline → fita de pista** (Catmull-Rom pelos pontos, tessellation adaptativa, UV por distância real).
2. **Cut & fill não destrutivo** (o modelo do ADR-0075): a estrada tem um greide próprio, o terreno se adapta a ele
   (platô na largura da pista + acostamento, talude em `smoothstep` até a base). O resultado é um **delta somado à
   base** do `Terrain`; `getHeights()` e a serialização continuam devolvendo só a base, então não fica cicatriz no
   heightmap salvo e mover ou apagar a estrada refaz o terreno no próximo build.
3. **Colisão da pista como chão do carro**: a malha da fita leva `userData.cortexRoad`, que o `setupVehicle` da
   engine e o do jogo já transformam em trimesh, e que o merge estático já preserva (SPEC-0316).
4. **Editor F2**: desenhar a spline no terreno (menu "Desenhar estrada"), editar o traçado arrastando os pontos e a
   seção "Estrada" no Inspector (largura, talude, inclinação máxima, greide, textura, chão do carro).
5. **Dado da cena**: nó `road` no `level.json`, com os pontos da curva; as edições do F2 vão para o overlay
   (`data.road[id]`), e o overlay vence o nó. O contrato está na [SPEC-0631](../specs/SPEC-0631-no-road-estrada-por-spline.md).

**Fica de fora** (continua removido pelo ADR-0089): perfis de via, cruzamentos, `navGraph`, `RegionSpec`/`CitySpec`,
marcações de pista, o catálogo `assets/roads/` e o modo `conform` (a pista deformada sobre o relevo — o ADR-0075 já o
tinha trocado pelo cut & fill na prática).

**Diferenças em relação ao código antigo (`48e4a616^`):**

- O greide é calculado sobre a **altura base** do terreno (`Terrain.baseHeightAt`), não por raycast na malha. O raycast
  via a malha já moldada, então reconstruir a estrada no editor realimentava o próprio corte.
- A moldagem percorre só as células perto de cada segmento (caixa do segmento ± alcance), em vez de testar cada vértice
  contra todos os segmentos. O custo passa de O(vértices × segmentos) para O(segmentos × células perto da pista), o
  que importa em ladrilhos de 256 m com estradas de quilômetros.
- Uma estrada molda **todos os ladrilhos** de terreno que cruza (o Port Hollow divide o terreno em ladrilhos). Como o
  delta depende só da posição no mundo, os vértices da borda comum de dois ladrilhos recebem o mesmo valor e não abrem
  degrau.
- Greide opcional pelos pontos (`grade: 'points'`): o gerador do jogo pode impor o perfil (o Y dos pontos), útil para
  um corte numa crista ou a cabeceira de uma ponte.

## Consequências

- Módulos novos e puros em `src/road/` (spline, fita, greide/moldagem), mais a montagem na cena num módulo à parte do
  `SceneBuilder` (que já passa de 500 linhas). API pública nova: `yarn docs:engine`, `engine-api.md`,
  `VENDOR_TYPE_MODULES` e `architecture.md` atualizados.
- O `Terrain` volta a ter base + delta (`setRoadMolding`, `baseHeightAt`). `sculpt`/`setHeights` mexem na base e
  mantêm o delta por cima; o próximo build (ou a próxima edição da estrada no F2) recalcula o corte sobre a base nova.
- A superfície é uma textura qualquer do projeto (escolhida no seletor de texturas) ou uma cor; não há catálogo
  embutido de pistas.
- Pista plana na largura (sem superelevação) e sem pontes: onde não há terreno, a pista segue o Y dos pontos e não tem
  apoio. Cada um desses pede registro próprio se vier a ser preciso.
- Esculpir à mão um ladrilho depois de traçar a estrada não apaga o corte (ele é recalculado sobre a base nova), e
  mudar a estrada não apaga a escultura.
