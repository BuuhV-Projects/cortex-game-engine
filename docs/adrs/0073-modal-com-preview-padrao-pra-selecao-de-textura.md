# 0073 - Modal com preview como padrão pra seleção de textura

**Data:** 2026-06-22
**Status:** aceito — em uso (estrada + terreno; `EditorTexturePicker`)

## Contexto

A seleção de textura no editor vinha como **dropdown** (`select`) com os nomes dos
arquivos — ruim em dois aspectos: (1) sem **preview**, você escolhe no escuro pelo nome;
(2) com muitos assets (ex.: o pack de estradas, centenas de PNGs) a lista fica enorme e
confusa (inclui normal maps, faixas com alpha, etc.). Na prática o usuário escolhia
texturas erradas (ex.: uma faixa de interseção como superfície de pista) e o resultado
ficava feio.

Já criamos um **modal com grade de miniaturas** (`EditorTexturePicker`, SPEC-0072) pra a
superfície da estrada e funcionou bem. Faz sentido **padronizar**: toda seleção de textura
no editor usa o mesmo modal com preview.

## Decisão

**Seleção de textura no editor usa SEMPRE o modal com preview** (`EditorTexturePicker`),
não dropdown de nomes. Regras:

1. **Componente único:** `src/editor/EditorTexturePicker.ts` (`open(title, items, onPick)`,
   grade de miniaturas, Esc/fundo fecham). É **chrome de viewport** (DOM overlay no frame
   do jogo) — aparece também no modo bridge da IDE.
2. **Itens com preview:** cada item é `{ name, thumb, value }` — `thumb` é a URL da imagem
   (servida pelo Vite); `value` é o que o `onPick` aplica (URL, ou `{diffuse,normal}`).
3. **Curadoria da lista** por contexto: só mostrar texturas **aplicáveis** àquele uso
   (ex.: superfícies de pista = `*Diffuse.png` na raiz de `assets/roads/`, sem
   barreira/placa/poste; terreno = imagens sem normal maps). Nunca despejar a pasta
   inteira nem listar normal maps como escolhas.
4. **Wiring:** a `*Api` de autoria expõe um método opcional `pickX?(obj)` (ex.:
   `RoadApi.pickSurface`, `TerrainApi.pickTexture`) **atribuído pelo `attachEditor`**
   (que detém o picker + a lista de assets do `/__list-assets`). O `EditorModel`
   (inspector declarativo) renderiza um **botão** "🖼 Escolher textura…" que chama esse
   método; após a escolha, `refreshUI()` (inspector in-canvas + ponte) reflete o estado.
5. **Importar arquivo** (`file` field) continua disponível ao lado do modal.

## Consequências

- **UX consistente e visual** em toda seleção de textura (estrada, terreno e futuros:
  material/decals/skybox/sprite). Menos escolha errada.
- **Padrão pra novas features:** ao adicionar qualquer seleção de textura, exponha
  `pickX?(obj)` na Api + botão no `EditorModel` + curadoria da lista no `attachEditor`.
  **Não** adicionar novos `select` de nomes de textura.
- Migrados nesta decisão: **estrada** (`RoadApi.pickSurface`, SPEC-0072) e **terreno**
  (`TerrainApi.pickTexture`). O dropdown fica só como **fallback** se o picker não for
  injetado (ex.: testes/uso headless da Api).
- O modal carrega miniaturas sob demanda (`loading=lazy`); se algum pack tiver imagens
  muito grandes, considerar thumbnails gerados (fora de escopo agora).
