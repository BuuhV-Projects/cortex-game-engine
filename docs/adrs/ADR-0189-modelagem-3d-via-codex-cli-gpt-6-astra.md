# 0189 - Modelagem 3D passa a usar o Codex CLI (GPT-6-Astra) pela subscription

**Data:** 2026-09-13
**Status:** aceito

## Contexto

A geração de modelos 3D do Studio (ADR-0004) funciona assim: o usuário descreve
o modelo em linguagem natural, um LLM escreve um script Python `bpy`, rodamos
`blender --background --python script.py` e devolvemos o `.glb`. O
`BlenderModelGenerator` (`src/ai/BlenderModelGenerator.ts`) é o dono desse fluxo,
e é consumido em dois pontos: a tool `generate_blender_model` do Chat IA
(`electron/agent/tools/blender.ts`) e o comando de CLI (`src/cli/index.ts`).

Até aqui, o LLM que escreve o script era o Claude, chamado via
`@anthropic-ai/claude-agent-sdk` em modo single-shot (ADR-0020), aproveitando a
mesma auth do Chat IA — OAuth do `claude login` ou `ANTHROPIC_API_KEY`.

Duas coisas mudaram:

1. O usuário passou a ter subscription do **Codex**, com acesso ao
   **GPT-6-Astra** (`gpt-6-astra`), descrito pela própria OpenAI como o modelo
   mais capaz para trabalho complexo — e a qualidade do script `bpy` é
   exatamente o gargalo desta feature: o que separa um modelo bonito de um
   amontoado de primitivas é o quão bem o LLM domina `bpy`/`bmesh`.
2. Escrever script `bpy` é uma tarefa **isolada e sem estado**: um prompt de
   sistema grande, uma descrição curta, uma resposta com um bloco de código.
   Não precisa de tools, sessão, MCP nem do resto do aparato do Chat IA. Ou
   seja: é o ponto do sistema com menor custo de troca de provider.

A restrição real é a **auth**. Não queremos gerenciar chave de API de mais um
provider (nem lê-la — credencial não é processada por automação neste projeto);
queremos usar a subscription que o usuário já paga, do mesmo jeito que hoje
usamos a subscription do Claude Code.

### Alternativas consideradas

- **A. SDK da OpenAI (`openai`) com `OPENAI_API_KEY`.** Rejeitada: cobra por
  token à parte da subscription que o usuário já tem, e adiciona uma credencial
  nova para gerenciar e vazar.
- **B. `@openai/codex-sdk` (SDK TypeScript do Codex).** Descartada por ora: é
  uma dependência a mais que, no fim, embrulha o mesmo binário do Codex CLI.
  Como precisamos de uma única chamada sem estado, o ganho de ergonomia não
  paga a dependência. Fica como evolução se um dia quisermos sessão/streaming.
- **C. `codex exec` (CLI headless), escolhida.** O Codex CLI já autentica pela
  subscription (`codex login`, credencial em `~/.codex/auth.json`), tem modo
  não-interativo com `--model`, e `--output-last-message` entrega o texto final
  do modelo em um arquivo — que é exatamente a forma do dado que já
  consumíamos. Custo de integração: `spawn` de processo, que este arquivo já
  faz para o Blender.
- **D. Manter o Claude e só oferecer o astra como opção configurável.**
  Rejeitada pelo usuário: a decisão é trocar, não multiplicar caminhos. Um
  seletor de provider seria superfície de código e de bug para uma escolha que
  na prática não muda.

## Decisão

**A modelagem 3D passa a chamar o GPT-6-Astra através do Codex CLI, e o Codex
CLI vira pré-requisito do Studio.**

Concretamente:

1. A chamada ao LLM em `BlenderModelGenerator` deixa de usar
   `@anthropic-ai/claude-agent-sdk` e passa por um adapter novo,
   `src/ai/CodexClient.ts`, que roda:

   ```
   codex exec --model gpt-6-astra --sandbox read-only --ephemeral \
     --ignore-user-config --ignore-rules --skip-git-repo-check \
     --output-last-message <tmp> -
   ```

   com o prompt (sistema + descrição) entregue por **stdin**.

2. **O escopo da troca é só a modelagem 3D.** O Chat IA (`agentLoop`), o
   `ScriptGenerator` (geração de JS/ECS) e o resto do Studio continuam no
   Claude. Não há fallback: se o Codex CLI faltar, a modelagem 3D falha com
   erro explícito, do mesmo jeito que já falha quando o Blender falta.

3. **Versão mínima do Codex CLI: 0.154.0.** Medido: a 0.151.0 recusa o astra
   com `400 invalid_request_error — "The 'gpt-6-astra' model requires a newer
   version of Codex"`. O adapter valida a versão antes de gastar uma chamada.

4. **O binário é resolvido, não assumido.** Ordem: `CODEX_PATH` do ambiente →
   caminho de instalação do app → `codex` do `PATH`. Motivo medido: durante
   esta investigação, `codex` no `PATH` era um shim do fnm apontando para o
   pacote npm global em 0.151.0, enquanto o app instalado ao lado já estava em
   0.154.0 — confiar no `PATH` dava erro 400 com uma CLI atualizada presente na
   máquina. O npm global foi atualizado depois, mas a divergência
   app/npm/shim-do-fnm é estrutural no Windows e vai reaparecer na próxima
   versão. Daí a resolução explícita e a mensagem de erro que diz qual binário
   foi usado e qual versão ele reportou.

### Por que estas flags

- `--sandbox read-only` — o Codex é um agente com tools; aqui só queremos
  texto. Read-only impede que ele escreva no disco por conta própria.
- `--ephemeral` — não polui o histórico de sessões pessoais do usuário com as
  chamadas do Studio.
- `--ignore-user-config --ignore-rules` — o Studio precisa se comportar igual
  independentemente do `~/.codex/config.toml` e das rules pessoais de quem
  estiver rodando. A auth **não** depende dessas flags.
- `--skip-git-repo-check` — a chamada roda em diretório temporário, não num
  repositório.
- stdin em vez de argumento — o prompt de sistema `bpy` tem milhares de
  caracteres e o Windows tem limite de linha de comando; stdin também elimina
  escaping.

## Consequências

**O que melhora**

- A qualidade do script `bpy` passa a ser a do modelo mais capaz disponível,
  sem custo marginal por token: usa a subscription já paga.
- A auth some do nosso código. Quem gerencia credencial é o Codex CLI; este
  repositório continua sem ler nenhum arquivo de segredo.
- O `BlenderModelGenerator` fica com uma costura explícita de provider
  (`CodexClient`), testável com o processo mockado — antes a chamada estava
  embutida numa função privada.

**O que piora / o que aceitar**

- **Novo pré-requisito de ambiente.** O Studio agora exige Codex CLI ≥ 0.154.0
  autenticado, além do Blender. Documentado no README e no `architecture.md`.
- **Dependência de um binário externo com flags instáveis.** As flags do
  `codex exec` podem mudar entre versões — o mesmo tipo de risco que já
  corremos com os parâmetros do exportador glTF do Blender. Mitigação: a
  versão mínima é verificada, e a falha traz o stderr do processo.
- **Latência e ausência de streaming.** É uma chamada de processo, sem token
  a token. Para esta feature não muda nada: a UI já espera o `.glb` ficar
  pronto, e o Blender domina o tempo total.
- **Duas subscriptions viram dependência do Studio** (Claude para o Chat IA,
  Codex para a modelagem). É o preço explícito de usar o melhor modelo em cada
  frente; se incomodar, o caminho de volta é curto — o `CodexClient` é a única
  peça a substituir.

**Efeito colateral corrigido junto** — ver SPEC-0190: a injeção do
`OUTPUT_PATH` no script gerado era frágil (o script podia redefinir a variável
depois, mandando o `.glb` para outro lugar). Foi observado na prática com o
astra no primeiro teste. A spec descreve o endurecimento.

**Ficam válidos:** ADR-0004 (Blender headless como executor) e ADR-0020 (Claude
Agent SDK) — este último continua valendo para o Chat IA e o `ScriptGenerator`,
deixando de valer apenas para a modelagem 3D.
