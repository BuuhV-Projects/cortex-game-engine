# PRD 0002 - Chat IA como agente do projeto

**Data:** 2026-05-25
**Status:** aceito (em implementação)

## Problema

O Chat IA (V1, PRD-0001) é só conversa: o usuário pergunta, a IA responde
texto, e o usuário copia/cola manualmente no projeto. Os dois recursos mais
poderosos do engine — `ScriptGenerator` (gera scripts ECS) e
`BlenderModelGenerator` (gera modelos `.glb`) — estão prontos, mas só
acessíveis pela CLI (`cortex-ai generate-script "…"`).

Resultado: o chat na sidebar parece um ChatGPT genérico. Não lê o projeto,
não escreve arquivo, não roda comando, não gera script, não gera modelo 3D.
Pra fazer qualquer coisa útil, o usuário precisa sair do IDE.

## Usuário e contexto

Desenvolvedor de jogos solo ou em times pequenos. Já está acostumado com
IDEs assistidas por IA (Cursor, Windsurf, Claude Code). Quer dizer
"crie um script de pulo" e ter o arquivo aparecendo na árvore do projeto;
quer dizer "gere uma espada medieval" e ter `assets/sword.glb` pronto pra
arrastar pra cena. Quer poder negar uma ação quando a IA propõe algo
errado, antes do disco ser tocado.

## Histórias do usuário

- **Como** desenvolvedor, **quero** pedir "crie um sistema de pulo" no
  chat, **para** ter o arquivo `.js` criado e adicionado ao projeto
  automaticamente.
- **Como** desenvolvedor, **quero** pedir "gere uma espada medieval em
  `assets/`", **para** ter um `.glb` PBR pronto pra usar.
- **Como** desenvolvedor, **quero** que a IA leia arquivos do meu projeto
  pra responder com contexto, **para** ela entender o código existente
  antes de propor mudanças.
- **Como** desenvolvedor, **quero** ver o que a IA está prestes a fazer
  e poder aprovar ou negar cada ação destrutiva, **para** não perder
  trabalho por sugestão ruim.
- **Como** desenvolvedor, **quero** que a IA não consiga sair da pasta
  do meu projeto, **para** que ela não toque em arquivos do sistema por
  engano (ou por prompt injection).

## Escopo desta versão (V2)

### Tools expostas à IA

| Tool | Tipo | Confirmação |
|---|---|---|
| `list_files(path)` | leitura | direta |
| `read_file(path)` | leitura | direta |
| `write_file(path, content)` | escrita | aprovação no chat |
| `delete_file(path)` | escrita | aprovação no chat |
| `run_command(command, args)` | execução | aprovação no chat |
| `generate_script(description, target_path)` | geração + escrita | aprovação no chat |
| `generate_blender_model(description, target_path)` | geração + escrita | aprovação no chat |

Todos os paths são interpretados **relativos ao projeto aberto** e validados
contra a raiz do projeto (sandbox). Caminho que escapa do projeto é
rejeitado antes de qualquer operação ser executada.

### Fluxo de tool use

1. Usuário envia mensagem no chat.
2. Main process chama Anthropic SDK com `tools=[...]` e o histórico.
3. SDK pode retornar `text` (renderiza streaming) e/ou `tool_use` blocks.
4. Pra cada `tool_use`:
   - Read-only → executa direto, devolve `tool_result`.
   - Write/exec → main envia `ai:tool_request` ao renderer com o detalhe da
     chamada. Chat mostra card "A IA quer fazer X" com botões Aprovar/Negar.
   - Usuário decide; renderer manda `ai:tool_decision` de volta.
   - Aprovado → executa, devolve `tool_result` com sucesso/erro.
   - Negado → devolve `tool_result` com erro "usuário negou".
5. Loop continua até `stop_reason === "end_turn"` ou usuário cancelar.

### UX no chat

- Mensagens da IA mostram blocos de texto em ordem.
- Cada `tool_use` vira um card inline com:
  - Nome da tool, parâmetros principais (preview).
  - Botões Aprovar/Negar (só pra tools sensíveis).
  - Estado: aguardando, executando, sucesso (com resultado curto), erro.
- Após aprovado, o card fica "executado" e o loop segue.

### Não-objetivos (desta versão)

- **Não** suportar múltiplas conversas / tabs.
- **Não** persistir histórico em disco (continua em memória, vaza ao fechar IDE).
- **Não** indexar projeto pra RAG.
- **Não** suportar outros LLMs além de Claude.
- **Não** mostrar diff visual sofisticado antes do `write_file` (V3).
- **Não** permitir que a IA inicie `run_command` em loops longos (cada
  comando é um one-shot com timeout).

## Critérios de sucesso

- Pedir "crie um script de pulo em scripts/jump.js" resulta em um arquivo
  funcional no projeto após uma aprovação do usuário.
- Pedir "gere uma espada medieval em assets/sword.glb" resulta em um
  `.glb` válido, com Blender disponível no PATH.
- Tentar escrever em `../../../etc/passwd` é rejeitado pelo sandbox antes
  de qualquer IPC chegar ao disco.
- Negar uma ação destrutiva impede a operação e a IA recebe a negação
  como contexto pra adaptar a resposta.

## Dependências

- ADR-0017 — Tool use com sandbox de projeto.
- ADR-0018 — Confirmação de ações destrutivas no chat.
- SPEC-0019 — Integração das ferramentas de geração (Script/Blender).
