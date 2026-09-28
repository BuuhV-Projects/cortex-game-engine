# ADR-0282 — Espuma restrita ao contato com o cenário

**Data:** 2026-09-28
**Status:** aceito

## Decisão

Substituir a espuma espalhada por uma máscara das interseções entre a geometria
do cenário e o nível médio da água. A máscara é calculada no carregamento e
amostrada pelo material existente; o ruído apenas anima a espuma dentro dela.
Impactos emitidos por `addRipple` continuam produzindo espuma local.

Um prepass de profundidade acrescentaria o desenho da cena a cada quadro e
repetiria as armadilhas do ADR-0092. O cenário já é caro no host. Contornos no
plano da água excluem objetos totalmente submersos, sem clarear grandes áreas.

## Limites

A máscara representa o nível médio, não a colisão física de cada onda. É
estática: mover o terreno exige chamar `Water.refreshShoreline()` ou reconstruir
a cena. Objetos com deformação por esqueleto são excluídos. A textura tem lado
máximo de 1024 pixels; cenários muito extensos reduzem a precisão das margens.
