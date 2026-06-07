# 0050 - Boot em modo edição + Play/Stop (estilo Unity)

**Data:** 2026-06-07
**Status:** aceito

## Contexto

O editor embutido (F2, ADR-0030/0042/0047) era um **overlay sobre o jogo rodando**:
o jogo abria em modo PLAY e F2 abria o editor (pausando a gameplay). O usuário
queria o modelo **Unity**: abrir sempre em **modo edição**, com a gameplay parada,
e um **Play** explícito que entra no modo jogo (e Stop volta pra edição,
revertendo o que mudou no play).

## Decisão

1. **Boot em modo EDIÇÃO por padrão** (dev): `attachEditor` inicia
   `editorState.active = true`. A gameplay já é pausada quando o editor está ativo
   (ADR-0046), então o jogo abre editável e parado.

2. **Override `?play` na URL:** boota em modo jogo (`editorState.active = false`).
   A **tool de playtest da IA** (que precisa rodar a gameplay e capturar) passa a
   carregar `viteUrl + '?play=1'`. Em `?play` não há UI de editor (botão/HUD).

3. **Botão ▶ Play / ⏹ Stop** sempre visível (topo-centro), alterna
   `editorState.active`. **F2** continua funcionando como atalho. O
   `EditorCameraSystem` passou a reagir à troca de modo por **qualquer fonte**
   (F2/botão/boot) via `prevActive`, não só pela borda do F2 — posiciona a câmera
   livre na pose da câmera do jogo ao entrar em edição.

4. **Play não-destrutivo (snapshot/restore):** ao entrar em Play, o `attachEditor`
   **snapshota** os `TransformComponent` do mundo; ao parar (Stop), **restaura**
   (e zera `vx/vy/grounded` de `PlatformerBody`). Assim testar não move o nível
   permanentemente — estilo Unity.

## Consequências

- O fluxo de trabalho vira Unity-like: abre editando, Play pra testar, Stop pra
  voltar sem perder o estado. F2 segue como atalho.
- A tool de playtest **precisa** do `?play` (senão capturaria o editor parado) —
  feito no `runAndCapture`. Qualquer outro consumidor que rode a gameplay headless
  deve passar `?play`.
- Em produção nada muda (sem editor; o jogo roda direto).
- O snapshot cobre **posição** (Transform) de todas as entidades + reset de
  velocidade do player. Estado fora de Transform/PlatformerBody (ex.: timers,
  spawns dinâmicos, score) **não** é revertido — pra isso, um sistema de
  serialização de cena seria necessário (evolução futura).
- Relaciona-se com ADR-0030/0042 (editor, bundle dev), 0046 (pausa no editor) e
  0033 (a IA roda/testa o jogo — agora via `?play`).
