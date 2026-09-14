# 0190 - Cliente Codex da modelagem 3D e injeção robusta do OUTPUT_PATH

**Data:** 2026-09-13
**Status:** aceito

Especifica o comportamento decidido no [ADR-0189](../adrs/ADR-0189-modelagem-3d-via-codex-cli-gpt-6-astra.md)
(modelagem 3D via Codex CLI / GPT-6-Astra).

## Contexto

`BlenderModelGenerator.generate()` faz sete passos: pede o script ao LLM,
extrai o bloco ` ```python `, injeta `OUTPUT_PATH`, salva em arquivo temporário,
roda o Blender headless, verifica que o `.glb` existe e não está vazio, e
devolve os caminhos. Só o **primeiro** passo é específico do provider — os
outros seis são a feature em si.

Dois problemas a resolver nesta mudança:

1. **A chamada ao LLM estava embutida.** A função privada `_querySingleShot`
   falava direto com o `@anthropic-ai/claude-agent-sdk`. Trocar de provider
   exigia mexer no arquivo da feature, e não havia como testar a orquestração
   sem uma credencial real.

2. **A injeção do `OUTPUT_PATH` era frágil.** O prompt de sistema instrui o
   modelo a *usar* `OUTPUT_PATH` sem redefini-la, e o código prepende
   `OUTPUT_PATH = "<caminho real>"` no topo do script. Se o modelo desobedece e
   escreve seu próprio `OUTPUT_PATH = "/tmp/cube.glb"` no meio do script, a
   redefinição **vence** — o Blender exporta para o caminho do modelo, o nosso
   `.glb` nunca aparece e a verificação do passo 6 falha com "Blender encerrou
   sem erro, mas o arquivo não foi criado", que aponta para o sintoma errado.
   Isso não é hipotético: foi o comportamento do GPT-6-Astra na primeira
   chamada de teste.

## Decisão

### 1. `src/ai/CodexClient.ts` — a costura de provider

Módulo novo, responsabilidade única: dado um prompt de sistema e um prompt de
usuário, devolver o texto final do modelo.

```ts
export const CODEX_MODEL = 'gpt-6-astra'
export const CODEX_MIN_VERSION = '0.154.0'

export async function queryCodex(
  systemPrompt: string,
  userPrompt: string,
): Promise<string>
```

**Resolução do binário**, nesta ordem — a primeira que existir vence:

1. `process.env.CODEX_PATH` (escape hatch explícito)
2. o executável do app: `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`
   no Windows; `/Applications/Codex.app/...` e `~/.local/bin/codex` nos demais
3. `codex` (resolvido pelo `PATH`)

**Validação de versão**: roda `codex --version`, extrai o `x.y.z` e compara
numericamente com `CODEX_MIN_VERSION`. Abaixo do mínimo é erro, com o caminho
do binário usado, a versão encontrada e a instrução de atualizar — porque o
sintoma nativo (HTTP 400 dizendo "requires a newer version") só aparece depois
de a chamada ser feita e não diz *qual* binário foi usado.

**Invocação**:

```
<codex> exec --model gpt-6-astra --sandbox read-only --ephemeral \
  --ignore-user-config --ignore-rules --skip-git-repo-check \
  --output-last-message <tmp>.txt -
```

- `cwd` é um diretório temporário (a chamada não tem nada a ver com o projeto).
- O prompt vai por **stdin**, como `<systemPrompt>\n\n---\n\n<userPrompt>`. O
  `codex exec` não tem parâmetro separado de system prompt; concatenar é o
  equivalente, e evita o limite de tamanho de linha de comando do Windows.
- `stdout` é descartado (é log de progresso do agente); o texto que interessa
  é lido do arquivo de `--output-last-message`. `stderr` é capturado e entra na
  mensagem de erro.
- O arquivo temporário é apagado no `finally`.

**Erros**, todos com mensagem acionável em pt-br:

| Situação | Mensagem |
| --- | --- |
| binário não encontrado (`ENOENT`) | como instalar o Codex CLI e que `CODEX_PATH` existe |
| versão < mínima | binário usado, versão encontrada, versão exigida, como atualizar |
| exit code ≠ 0 | código de saída + `stderr` |
| saída vazia | provável falta de auth — rodar `codex login` |

### 2. `BlenderModelGenerator` — o que muda e o que não muda

**Muda**: o passo 1 passa a chamar `queryCodex(BPY_SYSTEM_PROMPT, description)`.
A função `_querySingleShot` e o import do `claude-agent-sdk` saem do arquivo.

**Não muda**: o `BPY_SYSTEM_PROMPT` (é conhecimento de `bpy`, não de provider),
a assinatura pública `generate(description, outputPath) → { glbPath, scriptPath }`,
a extração do bloco ` ```python `, a execução do Blender e a verificação do
`.glb`. Quem consome — a tool `generate_blender_model` do Chat IA e a CLI — não
muda em nada.

### 3. Injeção robusta do `OUTPUT_PATH`

Antes de prepender a atribuição real, toda atribuição de `OUTPUT_PATH` em
**nível superior** no script gerado é neutralizada — comentada, não removida,
para que o script salvo continue legível quando alguém for depurar:

```python
OUTPUT_PATH = "D:/proj/assets/sword.glb"

# ... script do modelo ...
# [cortex] OUTPUT_PATH definido pelo Studio — redefinicao neutralizada:
# OUTPUT_PATH = "/tmp/cube.glb"
```

Regra: linhas que casam `^OUTPUT_PATH\s*=` (sem indentação — só nível superior;
uma atribuição indentada está dentro de função/`if` e não é o padrão observado)
viram comentário com a linha explicativa acima. Atribuições indentadas e
qualquer outro uso da variável ficam intocados.

## Consequências

- **A orquestração vira testável sem credencial.** `queryCodex` é mockável, e
  os testes cobrem: script gerado sem bloco ` ```python ` → erro; redefinição de
  `OUTPUT_PATH` → neutralizada; `.glb` ausente após o Blender → erro que aponta
  o script.
- **`CodexClient` é testável sem rede**: a resolução de binário e a comparação
  de versão são funções puras exportadas para teste.
- **Falha cedo e com endereço.** Codex ausente, desatualizado ou deslogado vira
  erro no primeiro uso da modelagem 3D, dizendo o que fazer — em vez de um 400
  cru vindo do processo filho.
- **Pré-requisito novo do Studio**: Codex CLI ≥ 0.154.0 autenticado. Some do
  ambiente de quem só usa o resto do Studio a exigência de nada — a modelagem
  3D já era opcional (dependia do Blender); agora depende de dois binários.
- **Limitação conhecida**: a neutralização do `OUTPUT_PATH` só cobre o nível
  superior. Um script que atribua a variável dentro de uma função e a use como
  global (`global OUTPUT_PATH`) escaparia. Não foi observado; se aparecer, o
  sintoma é o erro de "arquivo não criado" apontando o script, que é
  inspecionável.
