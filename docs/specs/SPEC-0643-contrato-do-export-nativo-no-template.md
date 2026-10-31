# SPEC-0643 - Contrato do export nativo: hook no template de projeto

**Data:** 2026-10-31
**Status:** aceito

## Contexto

O Port Hollow chegou ao export nativo a menos de 10 fps sem ninguém perceber (SPEC-0033 do jogo): o `Game` não pedia o
renderer próprio (ADR-0605); `outdoorLighting` sem `csm` fazia o three refazer a sombra em JS todo quadro (só o CSM
tem o passe em C++, SPEC-0289); ACES no renderer do three, `AmbientLight`, environment, `MeshPhysicalMaterial`, normal
map, mapas de metal/rugosidade e recorte alfa na sombra mandavam a cena de volta ao three. Nada disso aparece no Studio.
O template de projeto (`templates/new-project/`) nascia fora do contrato.

## Decisão

1. **Validador estático** `templates/new-project/.claude/hooks/native-contract.mjs` (Node puro, sem dependências; o
   `native-contract.sh` acha um node: `$CORTEX_NODE`, o do PATH ou um do nvm).
   - **ERRO**: `nativeRenderer: true` ausente no `new Game(...)` do `main.ts`; `outdoorLighting` de cena sem `csm: true`.
   - **DÉBITO** (o nativo ainda não tem; o objeto cai no three em JS): material físico (`KHR_materials_specular/ior/
     clearcoat/...`), normal map, mapa de metal/rugosidade, `alphaMode: MASK` (sombra C++ sem recorte alfa até a
     SPEC-0642), vegetação com várias malhas, e no código `AmbientLight`/luz pontual/`scene.environment =`/
     `toneMapping =`/`MeshPhysicalMaterial`/nó TSL sem `nativeMaterial`; `outdoorLighting` sem adaptação no host.
   - Regrava `docs/debito-nativo.md` do jogo (lista por arquivo).
2. **Hook `Stop` + `SubagentStop`** (`templates/new-project/.claude/settings.json`): roda ao fim de cada implementação
   do agente; exit 2 com erro ou débito novo (comparado ao relatório anterior); a 2ª passada (`stop_hook_active`) não
   bloqueia; a 1ª execução (sem `docs/debito-nativo.md`) só grava a linha de base; falha interna não bloqueia.
3. **Template dentro do contrato**: `main.ts` com `new Game({ canvas, nativeRenderer: true })`; `scenes/level.json`
   com `"csm": true, "shadowDistance": 150` no `outdoorLighting`.
4. **Distribuição**: o Studio cria o projeto copiando o template com `cp(templateDir, projectPath, { recursive: true })`
   (`fs:createProject`, `electron/main.ts`), que inclui a pasta oculta `.claude`; o `electron-builder.json` empacota
   `templates/` inteiro.

Uso manual: `sh .claude/hooks/native-contract.sh .` (relatório; sai 1 com ERRO).

## Consequências

- Heurístico: olha o asset em disco e o texto do código, não o que chega ao renderer. Não substitui medir no host.
- Quando a engine ganhar uma das features, a regra correspondente sai do `.mjs` do template (e dos jogos que o copiaram).
- Débito da ENGINE: modelo `standard` nativo sem normal map / metal-rugosidade / físico com só specular-ior; sombra C++
  sem recorte alfa (SPEC-0642). (O `outdoorLighting` se adapta sozinho no host desde a SPEC-0645/ADR-0644: a regra
  "sem adaptação no host" saiu do `.mjs`; ficou só "céu não uniforme" — `hdri`, `skyTop/Middle/Bottom`,
  `skyboxLighting` ou sem `sky` —, que a engine não converte.)
- Projeto novo nasce com 0 erros e 0 débitos.
