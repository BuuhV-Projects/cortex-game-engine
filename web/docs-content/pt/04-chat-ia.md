# Chat IA

O chat IA da sidebar é um **agente** — não só um chatbot. Ele lê o
seu projeto, escreve arquivos, edita código, roda comandos no
terminal embutido e gera modelos 3D via Blender. Sempre dentro do
sandbox do projeto ativo, e (no modo padrão) pedindo aprovação por
ferramenta antes de cada ação.

## Como o login funciona

<div class="callout callout-warn">

**A IDE não tem um sistema de conta próprio.** Ela usa a sua
assinatura do **Claude Code** — a CLI oficial da Anthropic. O login
é feito uma vez na CLI, e a IDE detecta automaticamente as
credenciais.

</div>

Por que assim? Três razões:

1. **Você usa o seu plano.** A cobrança vai pra sua assinatura
   Claude Code (Pro/Max), não passa pela IDE.
2. **Sem chave de API exposta.** Você não precisa colar uma chave da
   Anthropic em lugar nenhum — o token de OAuth vive no `~/.claude/`.
3. **Mesma sessão entre ferramentas.** Se você já usa Claude Code no
   terminal, a IDE continua a conversa do mesmo backend.

## Passo a passo

### 1. Instalar Claude Code

A CLI oficial é distribuída pela Anthropic. Página oficial:
[claude.com/product/claude-code](https://claude.com/product/claude-code).

Instalação típica (verificar a página oficial para o comando atual):

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Fazer login na conta Claude

No terminal:

```bash
claude
```

A primeira execução abre o browser para login OAuth. Logar na conta
que tem assinatura **Claude Pro** ou **Claude Max** — ambas
funcionam. As credenciais são salvas em `~/.claude/`.

Para confirmar:

```bash
claude --version
```

### 3. Abrir a IDE

A IDE detecta as credenciais automaticamente — não tem botão de
login, nem caixa de chave de API. Basta abrir o chat na sidebar e
mandar a primeira mensagem.

<div class="callout callout-info">

**Sem assinatura ativa?** O chat retorna erro de autenticação no
primeiro turno. A IDE não tem fallback gratuito — Claude Pro/Max
é o caminho obrigatório.

</div>

## Modos de operação

O chat tem dois modos, alternáveis no toggle do topo da sidebar:

- **Ask** (padrão) — para cada tool destrutiva (`Write`, `Edit`,
  `Bash`), aparece um card pedindo aprovação. Tools de leitura
  (`Read`, `Glob`, `Grep`) rodam direto.
- **Auto** — tudo é aprovado automaticamente. Cards de tool
  aparecem como histórico, sem bloquear. Útil quando você confia no
  pedido e quer ver o resultado de cabo a rabo.

## Sandbox

O agente só pode tocar arquivos dentro do **projeto ativo** (o que
está aberto no file tree). Tentativas de Write/Edit fora do projeto
falham. Read pode acessar imagens coladas (`Ctrl+V` na conversa) que
vivem em um diretório gerenciado pela IDE — esse é um caso
permitido por design.

## Histórico

O histórico de conversa fica salvo por projeto. Ao reabrir o mesmo
projeto, a IDE restaura a sessão do backend — você pode continuar
a discussão entre execuções da IDE.

## Limitações conhecidas

- Sem login programático na própria IDE — depende da CLI.
- Sem suporte a chave de API "manual" como fallback (decisão
  consciente: simplifica o modelo de auth).
- O agente respeita as regras documentadas em ADRs do projeto, mas
  ainda pode errar — sempre revise diffs antes de aceitar.
