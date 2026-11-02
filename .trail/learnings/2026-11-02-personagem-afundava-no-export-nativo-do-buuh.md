---
title: Personagem afundava no export nativo do Port Hollow (não no browser/DDD 61)
author: Buuh
date: 2026-11-02
id: l-5110d8e9
scope: repo
status: active
touches:
  - "src/systems/CharacterPhysicsSystem.ts#CharacterPhysicsSystem"
---

## Decided
31/10/2026, branch `fix/afunda-nativo` da engine (commits 27f16a1f, 30d701e4, ece28994; sem merge).
O raycast nativo estava CERTO (C++ = JS). Duas causas em `CharacterPhysicsSystem` com dt de 100 ms:
(1) o raio de chão saía de pés+stepHeight DEPOIS da gravidade e a queda do quadro passava por cima
da calçada; (2) o passo horizontal (0,6 m) maior que o raio levava o centro para DENTRO da caixa
invisível `plat-` (patamar 1,5 m acima da calçada), e de dentro (`FrontSide`) nem o empurrão nem o
chão a veem. O DDD 61 não sofria porque roda a 50–60 fps e o chão dele é a malha, não caixas.

**Why:** a sonda que achou isso gravava em arquivo via `__cortexWriteBaseFile` (o stdout do host
se perde quando ele é morto). Raycast JS em malha fundida sem BVH no Hermes trava 20 s+: limite a
sonda a malhas pequenas.

## Watch out
bug de física só no nativo → suspeite primeiro do dt longo.
Prova visual: `D:/ai-scripts/port-hollow/nativo-perf/prova.ps1`. Ver port-hollow-nativo-perf.

_From Claude Code's memory of this repo, last updated Nov 1._
