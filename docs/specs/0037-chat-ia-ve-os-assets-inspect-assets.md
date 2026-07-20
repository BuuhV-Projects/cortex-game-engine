# SPEC-0037 - Chat IA vê os assets antes de montar cena (inspect_assets)

**Data:** 2026-06-05
**Status:** aceito

## Contexto

Ao montar/popular uma cena com um pacote de assets `.glb` importado pelo usuário,
o Chat IA produzia cenários genéricos e feios: peças espaçadas de forma uniforme,
sem rotação nem agrupamento, pontes boiando no vão entre ilhas. A causa não era
capacidade do modelo — era **falta de visão**: o agente só enxergava os *nomes*
dos arquivos (`bridge.glb`, `rock.glb`), sem saber a aparência, a escala real ou
onde cada peça encaixa. O artista que montou a cena-demo do pacote via tudo; o
agente posicionava no escuro.

Já tínhamos o precedente de dar "olhos" ao agente para validar gameplay
(`playtest_game`, ADR-0033) e a integração com Blender headless para *gerar*
modelos (`generate_blender_model`, SPEC-0019/0004). Faltava o caminho inverso:
**inspecionar** modelos que já existem.

## Decisão

Nova tool MCP **`inspect_assets`** (`electron/agent/tools/assets.ts`), registrada
no `agentLoop.ts` ao lado de `generate_blender_model` e `playtest_game`.
Implementação em `electron/agent/assets/renderThumbnails.ts`:

1. Varre o diretório de assets (recursivo, cap 48 `.glb`).
2. Via **Blender headless** (mesmo binário/padrão `BLENDER_PATH` do
   `generate_blender_model`), roda um **script Python determinístico** (não
   gerado por LLM): importa cada GLB, calcula o bounding box em world-space,
   enquadra uma câmera 3/4 e renderiza um thumbnail com EEVEE. Cada asset em
   `try/except` isolado — um arquivo corrompido não derruba o lote.
3. As dimensões são reportadas em **eixos glTF/three (Y-up)**, em unidades do
   engine (Blender Z→altura, Y→profundidade, já que o importer converte Y-up→Z-up
   no load).

A tool devolve **blocos de imagem** (até 24 — o modelo VÊ cada modelo) + uma
**tabela markdown** com nome, dimensões (L×A×P), caminho do `.glb` e do thumbnail.
Os PNGs são persistidos em `<projeto>/.cortex/asset-thumbs/` pra `Read` sob
demanda (fallback / assets além do cap de imagens).

**Render via Blender, não via o renderer WebGPU do engine** (como faz o
`playtest_game`): a inspeção é independente de uma cena rodando, o Blender já
estava no pipeline, e o script determinístico dispensa subir vite/BrowserWindow
só pra fotografar um `.glb` isolado.

O `AGENT_SYSTEM_PROMPT` ganhou a seção **"Montagem de cenário / level design"**
que torna o fluxo explícito: (1) `inspect_assets` antes de posicionar qualquer
coisa; (2) procurar a cena-referência do pacote (`preview.png`/demo) e dar `Read`;
(3) tratar imagem de referência colada como contrato (analisar layout antes de
codificar); + princípios de composição (conectar pelas bordas usando o bbox,
variar rotação/escala, agrupar vegetação, assentar no chão, reusar antes de
gerar). A seção do `playtest_game` ganhou o **loop visual de correção** de cena
(screenshot → comparar com a referência → ajustar → repetir).

## Consequências

- A tool roda no main process e depende de **Blender no PATH** (ou `BLENDER_PATH`)
  — mesma dependência já assumida pelo `generate_blender_model`. Sem Blender,
  retorna erro claro.
- Inspecionar pacotes grandes é **lento** (uma render EEVEE por asset,
  sequencial); daí o cap default 48 e o parâmetro `max`.
- Não é unit-testável (Blender real) — validação manual: pedir ao Chat pra
  inspecionar uma pasta de `.glb` e conferir thumbnails/dimensões.
- `.cortex/asset-thumbs/` acumula PNGs no projeto — candidato a `.gitignore`
  (junto de `.cortex/playtest/`, ADR-0033).
- As diretrizes de level design são instruções de prompt — orientam, mas não
  garantem adesão sob pressão de contexto. Se o resultado ainda divergir, o
  próximo passo é tornar a inspeção um gate mais forte (UI sugerir/forçar
  inspeção ao detectar `.glb` não inspecionados na cena).
