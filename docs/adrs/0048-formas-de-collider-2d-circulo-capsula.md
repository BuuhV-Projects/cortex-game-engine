# 0048 - Formas de collider 2D: círculo e cápsula

**Data:** 2026-06-07
**Status:** aceito

## Contexto

O `Collider2DComponent` (ADR-0045/0047) só tinha forma **AABB (box)**. Pra objetos
arredondados (pedras, bolas) a caixa fica folgada e o player engancha em quinas; e
um player com forma de **cápsula** escorrega melhor em degraus/quinas. O usuário
pediu **círculo e cápsula** como formas de collider, mantendo o box-box (toda a
física tunada do projeto) intacto.

## Decisão

1. **`Collider2DComponent.shape`** (`ColliderShape2D = 'box' | 'circle' | 'capsule'`,
   default `box`): `circle` = raio `halfWidth`; `capsule` = vertical, raio
   `halfWidth`, altura total `2·halfHeight` (tampas semicirculares; se
   `halfHeight ≤ halfWidth`, vira círculo). Param posicional no fim → chamadas
   existentes seguem válidas.

2. **Solver de separação `src/systems/collide2d.ts`** (`penetrate`): MTV (normal +
   profundidade, normal de B pra A) pra qualquer par box/circle/capsule. Cápsula =
   disco varrido num segmento → reduz ao disco mais próximo do outro shape. Módulo
   puro, testado isolado.

3. **`PlatformerPhysicsSystem` — dois caminhos:**
   - **box ator × box sólido:** resolução por eixo (X depois Y) **inalterada** —
     preserva 100% o comportamento atual (grounded, oneWay, menor-penetração).
   - **qualquer forma redonda envolvida:** passo **MTV** — empurra pela normal e
     deriva a resposta dela (normal pra cima → pousa/`grounded`; pra baixo → teto;
     horizontal → parede). `oneWay` no MTV: só resolve se a normal aponta pra cima
     e o ator vinha de cima.

4. **Autoria/serialização:** `colliderSchema` ganhou `shape`; `buildScene` e o
   overlay (`data.colliders`) carregam/persistem a forma; o inspector tem um
   seletor **Forma** (rótulos de tamanho mudam: "Diâmetro" em círculo/cápsula); o
   gizmo desenha o contorno da forma (anel de mesh — círculo/estádio).

## Consequências

- Box-box continua na via per-axis tunada (zero regressão; 226 testes anteriores +
  8 novos: solver + física de forma).
- Colliders redondos dão colisão "rolada" (escorrega em quinas) — bom pra pedras e
  pro player; o normal diagonal num canto pode marcar grounded **e** parede ao
  mesmo tempo (comportamento aceitável de quina).
- O passo MTV é **single-pass por sólido** (como o box). Pilhas densas de formas
  redondas sobrepostas podem precisar de 2ª iteração no futuro; pra plataforma
  (sólidos separados) é suficiente.
- Capsule-capsule usa redução por segmento (aproximação); exato o bastante pros
  casos de plataforma.
- Relaciona-se com ADR-0045 (primitivas), 0047 (collider como propriedade do objeto).
