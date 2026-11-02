# SPEC-0658 - Espelho de cena nativo respeita a `matrix` de nó com `matrixAutoUpdate = false`

**Data:** 2026-11-02
**Status:** aceito

## Contexto

No export nativo do DDD 00 (Port Hollow) aparecia, no meio da rua perto do spawn, um bloco que não existe no
Studio: o reservatório redondo `industrial_b14`, a grua da obra e o alto de outros prédios, empilhados num ponto só.

O jogo monta a cidade em células de fusão (`Cells.add`): cada peça vira uma `Mesh` com `matrixAutoUpdate = false`
e a pose escrita direto em `mesh.matrix` (`position`/`quaternion`/`scale` ficam no padrão). O `mergeSubtree`
funde as malhas que dividem material; a que tem material único (2 malhas no mínimo para fundir) fica como estava.
No Port Hollow são 573 malhas assim (528 mil triângulos: armazém geral, igreja, `industrial_*`, caixas d'água,
lixeiras, pacotes de obra...).

O `NativeSceneMirror` descreve cada nó ao host só pelo TRS local (`descreverNo` no build e `_escreverLinhas` por
quadro), e o C++ recompõe a matriz de mundo a partir dele. Para essas malhas o TRS é a identidade, então o host as
desenhava todas na **origem do mundo**. No three (Studio/navegador) a `matrix` manual é respeitada, por isso nada
aparecia. Além do fantasma, eram 528 mil triângulos sempre na frente da câmera, nunca recortados.

## Decisão

- Nó com `matrixAutoUpdate === false`: o TRS que vai ao host sai de `objeto.matrix.decompose(...)`, nos dois
  caminhos (descrição do build/append e linha de sincronização do nó sujo). Nó com `matrixAutoUpdate === true`
  segue lendo `position`/`quaternion`/`scale` como antes (o caminho quente não muda).
- O TRS do objeto não é alterado (decompõe em temporários do módulo).

## Consequências

- O export desenha as peças avulsas das células onde o Studio desenha.
- Limites conhecidos: `decompose` não representa cisalhamento (matriz afim com escala não uniforme sob rotação) —
  essa malha sai aproximada. E escrever em `matrix` depois do install não suja o nó (não há gancho em `matrix`): a
  pose nova só chega ao host quando outra coisa sujar o slot. Peças estáticas, como as das células, não sofrem
  disso; objeto que se move por `matrix` manual precisa de `matrixAutoUpdate = true` ou de TRS.
- Teste: `tests/core/NativeSceneMirror.test.ts` (build e linha de sincronização).
