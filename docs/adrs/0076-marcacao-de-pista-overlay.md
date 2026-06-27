# 0076 - Marcação de pista (overlay)

**Data:** 2026-06-27
**Status:** aceito — parte da **Fase 2** do [ADR-0072](0072-sistema-de-estradas-spline-road-architect.md)

## Contexto

As estradas (ADR-0072/0075) já têm forma, textura e relação com o terreno, mas **sem
marcação** — faixa central, linhas de bordo, zona de ultrapassagem. É o maior salto
visual que falta pra a pista parecer real (linha tracejada, eixo amarelo etc.).

O Road Architect (MicroGSD, MIT — já vendorizado em `assets/roads/`) traz as texturas
de marcação prontas em `Markers/`: **overlays RGBA** (linhas opacas sobre fundo
transparente) desenhados pra **atravessar a largura** com as linhas na posição certa de
uma pista de 2 faixas, e **tilar no comprimento** (incluindo o ciclo do tracejado).

## Decisão

### Marcação = overlay que reusa o ribbon da pista
Nada de geometria nova: a marcação é um **mesh-overlay** que **clona a geometria já
conformada** da pista (`roadRibbon`/cut & fill), **levanta** os vértices um epsilon
(`+0.02 m`) e troca o material por um **transparente** (`transparent`, `depthWrite:
false`, `polygonOffset` — evitam z-fight com a pista por baixo). Vive como **filho** do
mesh da estrada (`userData.cortexRoadMarkings`); `applyRoad` o regenera a cada edição.

UV: o overlay herda o **U** da pista (0..1 na largura → as linhas caem no lugar) e
**reescala o V** pro tile da marcação (`markV = roadV · surfRepeat/markRepeat`), pra o
ciclo do tracejado ter o espaçamento certo independente do tile da superfície.

### Catálogo + campo do nó (dado da cena)
`ROAD_MARKINGS` (em `src/road/surfaces.ts`) mapeia nome amigável → textura `Markers/` +
`repeat` (m por ciclo): `dashed`, `single-yellow`, `double-yellow`, `passing`, `lane`
(layout de 2 faixas — o default do nó `road`). Novo campo `markings` no nó: nome
embutido ou `{ url, repeat }`; ausente = sem marcação. Editável no Inspector (seção
Estrada → "Marcação"), overlay do editor vence — igual ao resto.

## Consequências

- **Reusa o ribbon** — zero geometria nova; funciona igual em `conform` e `cutfill`
  (clona a geometria final, seja qual for).
- **Texturas já presentes** (`assets/roads/Markers/`, MIT) — sem novo asset no repo.
- **2 faixas por enquanto**: as texturas `-4L`/`-6L` (4/6 faixas) existem mas o nó `road`
  ainda não tem conceito de nº de faixas — abrir quando entrar `lanes`.
- **Sem decals pontuais** (zebra de pedestre, setas no chão, "STOP" pintado) — isto é
  marcação **longitudinal** (corre ao longo da pista). Decais por ponto = registro próprio.
- **API pública nova** (`ROAD_MARKINGS`/`resolveMarking`, campo `markings`) → `yarn
  docs:engine`, `engine-api.md`/`architecture.md` atualizados, re-vendorizar bundles.
