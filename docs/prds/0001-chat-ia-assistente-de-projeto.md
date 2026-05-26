# PRD 0001 - Chat IA como assistente do projeto

**Data:** 2026-05-25
**Status:** aceito (V1 em implementação)

## Problema

O `cortex-game-engine` já tem `ScriptGenerator` (geração de scripts ECS) e
`BlenderModelGenerator` (modelos 3D) via Claude — mas o acesso é só via
CLI (`cortex-ai generate-script "descrição"`). O usuário precisa sair do
IDE, montar o comando, copiar a saída de volta pro projeto. Inviável como
fluxo de trabalho.

Falta uma superfície dentro do IDE onde o usuário **conversa** com a IA
sobre o projeto ativo: "crie um script de pulo", "explique o que esse
arquivo faz", "instale a biblioteca X", "renderize uma luz na cena".

## Usuário e contexto

Desenvolvedor de jogos solo ou em times pequenos, que usa o IDE para
prototipar/criar jogos em TypeScript com ECS. Já tem familiaridade com
ferramentas de IA (Claude/ChatGPT/Copilot). Quer:

- Pedir mudanças em linguagem natural sem sair do IDE.
- Que a IA tenha **contexto do projeto** (ler arquivos, ver estrutura).
- Que a IA possa **agir no projeto** (criar arquivos, editar, instalar
  libs) — com aprovação explícita pra ações destrutivas.
- Conversas separadas **por projeto** — uma conversa sobre o jogo de
  plataforma não polui o assistente quando troca pro jogo de corrida.

## Histórias do usuário

- **Como** desenvolvedor, **quero** abrir uma sidebar de chat no IDE,
  **para** conversar com a IA sem alternar janelas.
- **Como** desenvolvedor, **quero** que o histórico fique salvo no
  projeto, **para** retomar o trabalho depois sem perder contexto.
- **Como** desenvolvedor, **quero** que a IA crie e edite arquivos do
  meu projeto, **para** não precisar copiar/colar.
- **Como** desenvolvedor, **quero** confirmar antes da IA aplicar
  mudanças, **para** não perder código por sugestões ruins.
- **Como** desenvolvedor, **quero** que cada projeto tenha seu próprio
  histórico, **para** os assuntos não se misturarem.

## Escopo por versão

### V1 (implementação inicial)
- Sidebar de chat à direita.
- Input multilinha + botão Enviar (Enter envia, Shift+Enter quebra linha).
- Mensagens com papel (usuário / assistente) e renderização básica
  (Markdown opcional — fica para V2).
- Streaming de respostas em tempo real.
- Histórico **em memória** durante a sessão; perdido ao fechar IDE.
- Sem tool use: a IA não age no projeto, só responde texto.
- Configuração da API key via variável de ambiente `ANTHROPIC_API_KEY`.

### V2 (próxima iteração)
- ~~Histórico persistido em `<projeto>/.cortex/chat-history.json`.~~ **Feito**, mas decidimos persistir em `<userData>/chats/<hash_sha1_do_path>.json` em vez de dentro do projeto — fica centralizado no IDE, não polui o repo e dispensa `.gitignore`. Trade-off: se o usuário mover/renomear o projeto, o histórico fica órfão.
- Carregamento automático ao abrir o projeto. **Feito.**
- Botão "Apagar histórico" no header do chat. **Feito.**
- Renderização de Markdown e blocos de código com highlighting.
- Tool use: a IA pode chamar `read_file`, `list_files`, `write_file`,
  `run_command`. `read_file`/`list_files` executam direto;
  `write_file`/`run_command` exigem confirmação do usuário (diff
  preview no caso de escrita).

### V3+ (não-bloqueante)
- Configuração de API key via UI (Settings).
- Múltiplas conversas por projeto (tabs de chat).
- Anexar imagens (screenshots de bugs, mockups).
- Indexação automática do projeto para RAG (perguntar sobre código
  sem precisar abrir cada arquivo).
- Suporte a outros provedores (OpenAI, Gemini) — provavelmente atrás
  de uma camada `LLMClient` comum.

## Critérios de sucesso (V1)

- Usuário consegue ter uma conversa de pelo menos 5 turnos sem erros.
- Resposta da IA começa a streamar em < 3s na maioria dos casos.
- Trocar de projeto não vaza histórico do projeto anterior na sessão.
- Sem API key, a UI mostra mensagem clara explicando como configurar.

## Não-objetivos (V1)

- **Não** vamos cobrir tool use ainda (deixa V2).
- **Não** vamos persistir histórico em disco ainda (deixa V2).
- **Não** vamos suportar outros LLMs (deixa V3+).
- **Não** vamos indexar o projeto pra RAG (deixa V3+).
