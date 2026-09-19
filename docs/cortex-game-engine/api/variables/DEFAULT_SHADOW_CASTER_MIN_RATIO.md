[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DEFAULT\_SHADOW\_CASTER\_MIN\_RATIO

# Variable: DEFAULT\_SHADOW\_CASTER\_MIN\_RATIO

> `const` **DEFAULT\_SHADOW\_CASTER\_MIN\_RATIO**: `0.05` = `0.05`

Defined in: [src/scene/ShadowCasterCulling.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ShadowCasterCulling.ts#L27)

Limiar default: objeto some da sombra além de ~20× o próprio raio (uma árvore
de 5 m de raio, além de 100 m). Escolhido por medição + comparação visual na
cena do `kart-racer` (SPEC-0197): corta 30% dos draws com screenshots
indistinguíveis do original; a partir de `0.1` a sombra de contato de um carro
distante começa a sumir.
