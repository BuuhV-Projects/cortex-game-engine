# ADR-0139 - LOD (nível de detalhe) por distância

**Data:** 2026-07-21
**Status:** aceito

## Contexto

Complemento do streaming (ADR-0138) no M-perf-4. O streaming decide o que está
CARREGADO (raio ao redor do jogador); o frustum culling do three decide o que é
DESENHADO (dentro da tela). Falta a terceira técnica clássica de open-world: o
que está **longe mas visível** não precisa de detalhe cheio — desenhar um prédio
de 45k triângulos com normal map a 200 m é desperdício de CPU/GPU.

## Decisão

**LOD por célula** via `THREE.LOD` (o `WebGPURenderer` troca o nível por distância
automaticamente — `autoUpdate`). Cada célula é um `LOD` com dois níveis:
- **nível 0 (perto):** a célula COMPLETA (prédios `.glb`, merge + bundle);
- **nível 1 (longe):** um **proxy low-poly** — uma caixa do bounding de cada
  prédio, todas fundidas numa malha só, material chapado sem normal map nem
  sombra. Barato de traversal, draw e fragment.

**Princípio (perto = qualidade, só o do fim = proxy):** o raio de FULL é pequeno
(a poucos metros da câmera, onde o detalhe importa) e o raio de PROXY é grande (o
horizonte fica visível, mas barato). No bench: full até ~95 m, proxy até 220 m.

Detalhe técnico: o `LOD` mede a distância a partir da SUA posição — então ele fica
no centro da célula e os filhos (geometria já baked em world pelo merge) recebem
um offset `-centro` pra renderizar no lugar certo.

## Consequências

- **Medido (bench):** com o LOD + streaming + tráfego realista, **65 fps**
  (worst-1% ~71), render p99 10 ms, ~37 draws/frame — a maioria das células
  residentes é proxy barato; só as pouquíssimas perto são full.
- **Frustum culling** é automático (three, por objeto) — não desenha o que sai da
  tela. Não precisou de código; a nota fica aqui pra fechar o trio
  streaming (carrega) × frustum (desenha) × LOD (detalha).
- **Proxy é caixa** no bench (não há malha decimada dos `.glb`). Num jogo real o
  nível 1 seria um `.glb` low-poly autorado ou uma decimação — o mecanismo
  (`THREE.LOD` por distância) é o mesmo.
- LOD e merge convivem porque o LOD é **por célula** (célula inteira full vs
  proxy) — merge por-objeto dentro da célula não conflita com o swap por célula.
