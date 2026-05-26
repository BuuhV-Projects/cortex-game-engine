# 0021 - Agente do Chat IA deve preferir cortex-game-engine sobre three direto

**Data:** 2026-05-26
**Status:** aceito

## Contexto

O Chat IA roda como agente com tools Write/Edit/Bash (ADR-0020). Sem
direcionamento, o agente tende a:

- Importar `three` direto quando precisa de uma geometria/material/helper
  específico que ele "lembra" da API do three (vasto), mesmo quando o
  `cortex-game-engine` já re-exporta essa classe.
- Cair em fallback silencioso quando o engine não expõe algo — usuário
  acaba com código fora do padrão sem saber.

Como `three` não está em `node_modules` do projeto criado (está embutido
no bundle do engine, ADR-0009), imports diretos de `'three'` quebram em
tempo de build. E o objetivo do engine é justamente abstrair Three —
saídas pela tangente fragmentam essa abstração.

## Decisão

O `AGENT_SYSTEM_PROMPT` em [electron/agent/agentLoop.ts](../../electron/agent/agentLoop.ts)
instrui o agente a:

1. **Antes de codar features que tocam o engine** (cena, render, input,
   áudio, física, ECS, modelos 3D), ler
   `vendor/cortex-game-engine/index.d.ts` para mapear o que está disponível.
2. **Importar sempre de `'cortex-game-engine'`** — o alias do Vite resolve
   para o bundle vendored. Importações diretas de `'three'` são proibidas.
3. **Quando o engine não expor algo necessário**:
   - Avisar o usuário no texto da resposta, explicitando qual recurso faltou.
   - Sugerir estender o engine (adicionar re-export em `src/index-runtime.ts`
     ou nova classe em `src/core/`/`src/ecs/`) e perguntar antes de prosseguir.
   - Só cair em fallback (truque para puxar three, reimplementação inline)
     com aprovação explícita.
4. **Transparência acima de conveniência** — nunca esconder que saiu do
   padrão.

## Consequências

- Cada saída pela tangente vira ponto de discussão com o usuário e
  candidata a virar feature do engine — o motor evolui pelo uso real.
- O agente pode ficar marginalmente mais lento em algumas tarefas porque
  lê o `index.d.ts` antes de cada feature nova. Aceitável: `Read` é
  auto-aprovado e cacheado pelo Claude Code backend.
- Pedidos vagos do usuário ("crie uma luz spot") deixam de virar
  silently `import { SpotLight } from 'three'` — o agente verifica se
  `SpotLight` está re-exportado (já está, em `src/index-runtime.ts`) e
  usa via `'cortex-game-engine'`.
- Se o usuário pedir algo realmente fora do escopo do engine (físicas
  rígidas complexas, partículas avançadas), o agente avisa antes de
  improvisar — usuário decide se vale a pena estender o engine ou aceitar
  o fallback.

## Referências

- ADR-0009 — Vendoring engine inline (por que `three` não está em
  `node_modules`).
- ADR-0020 — Migração para Claude Agent SDK.
- src/index-runtime.ts — re-exports atuais de three (Mesh, geometrias,
  materiais, luzes, vetores).
