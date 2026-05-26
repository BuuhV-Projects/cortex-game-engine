# 0018 - Confirmação de ações destrutivas no Chat IA

**Data:** 2026-05-25
**Status:** aceito (implementa PRD-0002)

## Contexto

Algumas tools do agente (ADR-0017) modificam o projeto ou executam
processos: `write_file`, `delete_file`, `run_command`, `generate_script`,
`generate_blender_model`. A IA pode errar, alucinar paths, ou ser
manipulada por prompt injection embutida em arquivos que ela leu. Não dá
pra deixar essas ações rodarem sem que o usuário veja e confirme.

Mas pedir confirmação por modal nativo trava o IDE e quebra o fluxo. E
pedir só "y/n" no chat é ruim — o usuário precisa ver o que está
prestes a acontecer.

## Decisão

**Aprovação inline no chat, não-bloqueante.**

Quando o main detecta um `tool_use` que precisa de confirmação, ele:

1. Pausa o loop do agente (sem dar timeout — espera o usuário).
2. Emite `ai:tool_request` ao renderer com:
   - `id` (correspondente ao `tool_use_id` da Anthropic)
   - `name`
   - `input` (parâmetros normalizados)
   - `summary` (resumo human-readable, ex: "Criar arquivo
     `scripts/jump.js` (1.2 KB)")
3. Renderer renderiza um **card de tool call** dentro do fluxo do chat:
   - Título: nome da tool + summary
   - Detalhes expansíveis (path, preview do conteúdo / comando completo)
   - Botões: **Aprovar** | **Negar**
4. Usuário clica. Renderer manda `ai:tool_decision` com
   `{ id, approved: boolean }`.
5. Main resume o loop:
   - Aprovado → executa, devolve `tool_result` real.
   - Negado → devolve `tool_result` com `is_error: true` e mensagem
     `"Usuário negou esta operação."` — a IA vê isso e pode tentar
     outra abordagem ou pedir mais detalhes.

**Aprovação em lote dentro do mesmo turno** — se a IA enfileira várias
tools (ex: 3 `write_file`), cada uma vira um card separado. Usuário
aprova/nega individualmente. Sem "aprovar todos" pra evitar erro humano
em sequência.

**Tools sem aprovação** — `list_files` e `read_file` executam direto e
viram cards "informativos" (sem botões, marcados como já executados).

**Estado dos cards:**

| Estado | Visual |
|---|---|
| aguardando | botões Aprovar/Negar ativos |
| executando | spinner + texto "executando..." |
| sucesso | check + resumo do resultado (ex: "arquivo criado") |
| erro | X vermelho + mensagem de erro |
| negado | texto "negado pelo usuário" |

Cards ficam visíveis no histórico do chat depois de resolvidos — ajuda
o usuário a reconstruir o que aconteceu.

**Cancelar turno** — botão "Parar" no input do chat. Cancela o loop em
qualquer ponto: aborta stream em andamento, marca tools pendentes como
negadas, encerra com mensagem "Cancelado pelo usuário."

## Consequências

- Usuário tem controle total — nada toca o projeto sem clique explícito.
- Latência maior: cada ação destrutiva pausa pra esperar humano.
- Histórico do chat fica mais denso (cards de tool entre mensagens),
  mas isso é justamente o que dá pra entender o que rolou.
- Reaproveita o mesmo canal de mensagens que já existe — nada de modal
  nativo, sem quebra de UX.

## Alternativas descartadas

- **Modo "auto-aprove" configurável** — perigoso, fica pra V3 com lista
  explícita do que pode auto-aprovar (ex: write em paths específicos).
- **Diff visual antes do write** — útil mas complexo (Monaco em diff
  mode); fica pra V3.
- **Confirmação por modal nativo** — interrompe o flow, péssima UX.

## Referências

- ADR-0017 — Tool use com sandbox de projeto.
- PRD-0002 — Chat IA como agente.
