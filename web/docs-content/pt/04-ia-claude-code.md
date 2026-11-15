# IA com Claude Code (MCP)

A IA do Cortex Studio é o **Claude Code** — a ferramenta oficial da
Anthropic (CLI, extensão do VS Code ou app desktop) — aberto na pasta
do projeto do seu jogo. O Studio não tem mais um chat próprio: ele
entrega à IA o que só ele sabe fazer através de um **servidor MCP**
chamado `cortex`.

Com o MCP `cortex`, o Claude Code passa a enxergar os kits de assets
do engine, mede e fotografa modelos `.glb`, valida a cena e consulta
a API do engine na versão que o Studio instalou. O resto — ler e
escrever arquivos, rodar comandos, planejar, pedir aprovação — é o
Claude Code que faz, do jeito que você já conhece.

<div class="callout callout-info">

**O editor funciona sem IA.** Cena, Inspector, preview e export não
dependem do Claude Code. Ele só é necessário para a parte de IA.

</div>

## Instalar e conectar

### 1. Instalar o Claude Code

Baixe pela página oficial:
[claude.com/product/claude-code](https://claude.com/product/claude-code).
É preciso a **versão 2.0 ou mais nova** e uma conta Claude com
assinatura (Pro/Max) ou outro plano aceito pelo Claude Code. Na
primeira execução de `claude`, o login é feito pelo navegador.

Para conferir a versão:

```bash
claude --version
```

### 2. Registrar o MCP (automático)

**Instale o Claude Code antes do Studio** e não precisa fazer mais
nada: no fim da instalação, o instalador do Studio:

1. checa os requisitos (Claude Code, Blender e Git);
2. registra o MCP `cortex` no Claude Code do seu usuário
   (`claude mcp add --scope user cortex`);
3. mostra um relatório com o que encontrou e o que falta. O mesmo
   relatório fica salvo em `<pasta do Studio>\requisitos.txt`.

Reinstalar ou atualizar o Studio registra de novo, já apontando para
o executável novo. Desinstalar remove o registro.

### 3. Registrar depois (manual)

Se você instalou o Claude Code **depois** do Studio, o relatório da
instalação avisa que o registro ficou pendente. Rode no PowerShell,
trocando `<Studio>` pela pasta onde o Studio está instalado:

```powershell
$env:ELECTRON_RUN_AS_NODE=1; & "<Studio>\TS Cortex Studio.exe" "<Studio>\resources\mcp\cortex-setup.mjs" --register
```

O MCP roda com o próprio executável do Studio — você não precisa de
Node na máquina para ele.

Para conferir se ficou registrado:

```bash
claude mcp list
```

O `cortex` deve aparecer na lista.

## Como usar

1. Abra o Claude Code **na pasta do projeto do jogo** (no terminal,
   `cd` até a pasta e rode `claude`; no VS Code ou no app desktop,
   abra a pasta). As tools do `cortex` trabalham sobre essa pasta e
   não saem dela.
2. Peça o que quiser em linguagem natural. O Claude Code decide
   quando chamar cada tool do `cortex` — você não precisa citá-las.

Exemplos de pedidos que funcionam bem:

- "Quais kits de assets o engine tem? Escolha um de plataforma e
  importe só as peças de chão e de moeda."
- "Meça os `.glb` de `assets/props/` e me diga quais estão fora da
  escala de metros."
- "Valide a cena `scenes/main.json` e corrija o que estiver
  flutuando ou atravessando o chão."
- "Como funciona o `AssetLoader`? Mostre a assinatura e um exemplo."
- "Crie um sistema que faz a plataforma subir e descer, usando a API
  do engine."

## Tools do MCP `cortex`

| Tool | O que faz |
|---|---|
| `list_kits` | Lista os kits de assets do engine: nº de assets, papéis e tags. |
| `list_kit_assets` | Lista os arquivos de um kit, com filtro por papel ou tag. |
| `import_kit` | Copia um kit (ou só parte dele) para `assets/<kit>/` do projeto, com `kit.json` e thumbnails. |
| `measure_glb` | Mede largura × altura × profundidade (em metros) de arquivos `.glb`. |
| `inspect_assets` | Gera thumbnails e a tabela de medidas de uma pasta de modelos. **Precisa do Blender.** |
| `validate_scene` | Aponta erros e avisos geométricos de uma cena (`scenes/*.json`). |
| `engine_api_index` | Índice das seções do guia da API e da arquitetura do engine. |
| `engine_api_section` | Texto inteiro de uma seção do guia. |
| `engine_api_symbol` | Referência de um export do engine (classe, função, tipo). |
| `engine_api_search` | Busca na API do engine por nome ou assunto. |

O servidor também expõe dois **resources** que o Claude Code pode
anexar à conversa: `cortex://docs/engine-api.md` (guia da API) e
`cortex://docs/architecture.md` (arquitetura do engine).

As respostas da API vêm com a versão do engine do Studio instalado.

## Limitações

- **Sem playtest pela IA, por enquanto.** A IA ainda não roda o jogo
  nem tira screenshot para conferir o resultado — teste no preview do
  Studio e conte o que viu.
- **Gerar modelo 3D não é uma tool.** Quando precisa de um modelo, o
  Claude Code escreve o script do Blender por conta própria. Veja
  [Blender](#blender).
- **`inspect_assets` exige Blender.** Sem ele, as demais tools
  continuam funcionando.
- **A IA ainda pode errar.** Revise os diffs que o Claude Code propõe
  antes de aceitar.
