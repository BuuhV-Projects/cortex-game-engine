# SPEC-0275 — Piloto no veículo: componentes, convenção de asset e cena de validação

**Data:** 2026-09-25
**Status:** aceito
**Decisão:** ADR-0274

## Contexto

Suporte genérico a um personagem pilotando um veículo: sentar no assento,
animar por estado de direção e inclinar corpo/cabeça por cima da animação.
Serve a qualquer veículo (kart, moto, carro) — o nome dos anchors segue a
convenção do kart abaixo.

## Decisão

### 1. Parâmetros de direção — `VehicleDriveParams`

Objeto simples que o jogo (input ou IA) escreve uma vez por frame. O animador e
a pose leem **o mesmo objeto**.

| campo | faixa | significado |
| --- | --- | --- |
| `speed` | m/s (com sinal) | velocidade de avanço |
| `steer` | −1..1 | −1 esquerda, +1 direita (mesma convenção do input) |
| `throttle` | 0..1 | acelerador |
| `brake` | 0..1 | freio |
| `drift` | −1..1 | 0 sem drift; sinal = lado |

### 2. `VehicleSeatAttachmentComponent(vehicle, seatName, driver, opts?)`

- Procura `seatName` por nome em `vehicle` (default `'assento'`).
- Achou: `seat.add(driver)` e, **todo frame**, aplica `offset` (posição local),
  `rotation` (Euler, rad) e `scale` (número ou vetor) — editar os campos tem
  efeito ao vivo.
- Não achou: `error` recebe a mensagem com os nomes que existem no veículo,
  `console.error` uma vez, e o piloto não é mexido (o jogo segue rodando).
- `attachToSeat(...)` faz a mesma coisa de forma síncrona e **lança** o erro —
  é o que o `setupVehicleDriver` usa no carregamento.

### 3. `VehicleAnimatorComponent(root, clips, opts?)`

- Cria o próprio `AnimationMixer(root)`.
- `clipMap` estado → nome do clipe; default = o próprio nome do estado
  (`idle`, `accelerate`, `brake`, `steer_left`, `steer_right`, `drift_left`,
  `drift_right`, `victory`).
- Estado por frame: `forcedState` se definido; senão
  `deriveVehicleAnimState(params)`, nesta precedência:

  1. `|drift| ≥ drift` **e** `|speed| ≥ minDriftSpeed` → `drift_left/right`
  2. `brake ≥ pedal` → `brake`
  3. `|steer| ≥ steer` → `steer_left/right`
  4. `throttle ≥ pedal` → `accelerate`
  5. `idle`

  Limiares default: `pedal 0,2`, `steer 0,25`, `drift 0,3`, `minDriftSpeed 2 m/s`.
- Estado sem clipe cai no fallback: `drift_x → steer_x → idle`, os demais `→ idle`.
- Crossfade por peso (ADR-0274 §2), duração `crossFade` (default 0,25 s).
  `victory` toca uma vez e congela no último quadro; os outros repetem.
- Estado público: `state` (lógico) e `activeClip` (nome do clipe tocando).

#### Contrato dos clipes (baked no Blender — sem IK em runtime)

A pose de mãos e pés é resolvida no Blender e gravada em cada clipe. A engine
não corrige mão nem pé.

| clipe | pose baked |
| --- | --- |
| `idle`, `accelerate` | mãos no volante reto |
| `steer_left`, `drift_left` | mãos e tronco acompanhando o volante para a esquerda |
| `steer_right`, `drift_right` | mãos e tronco acompanhando o volante para a direita |
| `brake` | pé direito no freio |
| `victory` | pose independente do volante |

### 4. `ProceduralDriverPoseComponent(root, params, opts?)`

Roda **depois** do mixer do mesmo piloto e só faz **ajuste fino** de coluna,
peito e cabeça — a curva do tronco já vem no clipe. Alvos, no referencial do piloto
(+Z frente, +Y cima):

Cada entrada é normalizada em −1..1 (`clamp`) e multiplicada pelo limite — o
limite é literalmente o ângulo máximo que o bone recebe.

| rotação | fórmula | limite default |
| --- | --- | --- |
| roll do corpo (eixo Z) | `clamp(steer·0,6 + drift·0,4) · maxRoll · intensidade` | `maxRoll` 0,12 rad |
| pitch do corpo (eixo X) | `clamp(brake − throttle·0,6) · maxPitch · intensidade` | `maxPitch` 0,08 rad |
| yaw da cabeça (eixo Y) | `−clamp(steer·0,7 + drift·0,3) · maxHeadYaw` | `maxHeadYaw` 0,3 rad |
| roll da cabeça | `−clamp(roll/maxRoll) · maxHeadRoll` (nivela o olhar) | `maxHeadRoll` 0,08 rad |

`intensidade = min(1, |speed| / speedRef)`, `speedRef` default 12 m/s — o corpo
não inclina com o kart parado; a cabeça olha para a curva sempre.

O corpo divide o total entre `Spine` (40%) e `Chest` (60%); a cabeça recebe o
seu. Os alvos são suavizados (`smoothing` 8/s). Bone ausente é ignorado
(`missingBones` lista quais). Limites e ganhos são opções do construtor e campos
públicos (editáveis ao vivo).

### 5. `VehicleDriverSystem` (prioridade 55)

Por entidade: assento → mixer → pose. Depois dos pilotos que escrevem os
parâmetros (input 30, scripts de IA 50). `pauseWhen` recebido na construção.

### 6. Convenção de asset e validação

| asset | nomes obrigatórios |
| --- | --- |
| kart (anchors, qualquer `Object3D`) | `assento`, `volante`, `roda_frente_esquerda`, `roda_frente_direita`, `roda_traseira_esquerda`, `roda_traseira_direita` |
| piloto (`Bone`) | `Head`, `Spine`, `Chest`, `LeftHand`, `RightHand`, `LeftFoot`, `RightFoot` |
| clipes | os 8 estados acima |

`validateVehicleAssets({ vehicle, driver, clips })` → relatório com
`found`/`missing` de anchors, bones e clipes, mais o que o asset tem (para o
autor renomear). `formatVehicleAssetReport` vira texto.

`setupVehicleDriver(world, cfg)`:

1. valida; **lança** se `assento` faltar (a mensagem traz o relatório);
2. os outros itens ausentes viram `console.warn` com o relatório;
3. cria a entidade com os três componentes sobre um `params` compartilhado;
4. registra o `VehicleDriverSystem` se ainda não houver.

Devolve `{ entity, params, report, seat, animator, pose }`.

### 7. Cena de validação — `yarn dev:vehicle-driver`

`examples/vehicle-driver/`: kart e piloto **procedurais** (grupos nomeados pela
convenção; piloto com bones e clipes gerados em código) — a cena valida a
engine sem depender de asset. `?vehicle=/kart.glb&driver=/piloto.glb` troca por
GLBs em `examples/vehicle-driver/public/`.

| tecla | ação |
| --- | --- |
| W / S | acelera / freia (ré parado) |
| A / D | esterça |
| Espaço | drift |
| 1–8 | força o estado (`idle` … `victory`) |
| 0 | volta ao automático |
| C | alterna câmera lateral (ver mãos e pés) |

Em dev, painel com estado, clipe ativo, parâmetros e o relatório de
anchors/bones/clipes.

## Consequências

- Um jogo liga piloto em veículo com uma chamada e só escreve `params`.
- Sem IK (mãos no volante, pés nos pedais) e sem nó de cena/Inspector — ver
  ADR-0274.
