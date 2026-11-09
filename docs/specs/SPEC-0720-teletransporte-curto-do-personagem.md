# SPEC-0720 - Teletransporte curto do personagem não é varrido contra parede

**Data:** 2026-11-09
**Status:** implementado
**Relacionados:** SPEC-0648 (varredura do passo de quadro longo), SPEC-0302 (varredura da cena a cada
`COLLECT_INTERVAL_MS`)

## Contexto

O `CharacterPhysicsSystem` varre o passo horizontal de cada quadro a partir da posição resolvida no quadro anterior
(`lastXZ`, SPEC-0648): com uma parede no caminho, o passo para a um raio da face. Um salto maior que 8 m conta como
teletransporte e não é varrido. Um salto menor conta como passo.

Quando o jogo põe o personagem em outro lugar a menos de 8 m (escrevendo no `TransformComponent`), a varredura parte do
lugar antigo. Se houver parede entre os dois pontos, o personagem para do lado errado dela. Pior: se o jogo repetir o
`place` a cada quadro (um ponto preso durante uma transição), a varredura parte de novo do lado errado e a parede o barra
sempre.

O caso real é o Port Hollow (SPEC-0251 do jogo): o interior da pizzaria fica 400 m acima da porta, e o ponto de aparecer
fica a menos de 8 m da porta no plano. Quando a varredura de colisores caía no quadro da entrada, o passo que saía da
calçada batia na parede do meio do salão, e o detetive ficava do outro lado, sem piso, caindo e voltando. O jogo contornou
o problema escondendo o interior por um quadro. A volta ao ponto de aparecer depois de uma queda, porém, continua exposta.

## Comportamento

- `CharacterBodyComponent.teleported()` avisa que a posição foi posta de fora. No próximo tick, o
  `CharacterPhysicsSystem` não varre o passo daquele personagem: a posição escrita vale inteira, como num salto acima de
  8 m. O resto do tick (gravidade, chão, empurrão de parede, troncos) roda igual, e a posição resolvida do fim do tick
  passa a ser o ponto de partida do quadro seguinte.
- O aviso vale para um tick só: o sistema o consome (`teleportQueued` volta a `false`), com ou sem sólidos na cena.
- Sem o aviso, nada muda: o passo curto continua varrido (SPEC-0648).

## Formato

- `src/components/CharacterBodyComponent.ts`: `teleportQueued = false` e `teleported(): void`, no mesmo padrão de
  `jumpQueued` / `jump()`.
- `src/systems/CharacterPhysicsSystem.ts`: no passo varrido, `if (last && !c.teleportQueued && …)`; o aviso é zerado
  em seguida.

## Testes

`tests/systems/characterTeleport.test.ts` (Vitest), com a mesma cena do `characterSweep.test.ts` (calçada e patamar
sólido):

- sem aviso, pôr o personagem 3 m adiante, do outro lado da face, para antes dela (o comportamento da SPEC-0648);
- com `teleported()`, o mesmo salto vale inteiro;
- o aviso vale um tick só: no tick seguinte, um passo curto contra a face volta a ser varrido;
- repetir o `place` + `teleported()` por vários quadros (o ponto preso) mantém o personagem no ponto posto.

## Consequências

- Quem teletransporta um personagem a menos de 8 m chama `body.teleported()` junto da escrita no transform. Sem isso,
  vale a regra antiga.
- Sem custo por quadro: um booleano por personagem.
