[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / profileMesh

# Function: profileMesh()

> **profileMesh**(`samples`, `profile`, `uvScale?`): [`ProfileMeshPart`](../interfaces/ProfileMeshPart.md)[]

Defined in: src/road/roadProfileMesh.ts:74

**Extruda o perfil ([RoadProfile](../interfaces/RoadProfile.md)) ao longo das amostras da spline** (ADR-0087) — o
coração do EasyRoad estendido. Cada faixa vira uma tira plana na sua altura; entre faixas de
alturas diferentes, gera um **meio-fio** (face vertical). Retorna um [ProfileMeshPart](../interfaces/ProfileMeshPart.md)
por faixa + um por meio-fio (papel `curb`), pro consumidor atribuir material/collider:
`drivable` → pista (`cortexRoad`), `curb` → parede baixa, `walkable` → calçada/nav de pedestre.

O perfil é **centrado** na centerline (borda esquerda em −largura/2). `uvScale` = metros por
tile no comprimento.

## Parameters

### samples

[`RoadSample`](../interfaces/RoadSample.md)[]

### profile

[`RoadProfile`](../interfaces/RoadProfile.md)

### uvScale?

`number` = `8`

## Returns

[`ProfileMeshPart`](../interfaces/ProfileMeshPart.md)[]
