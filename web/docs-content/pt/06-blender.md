# Blender

O Studio usa o Blender instalado na sua máquina para três coisas:

- **`inspect_assets`** — a tool do MCP `cortex` que gera thumbnails e
  a tabela de medidas de uma pasta de modelos, para a IA *ver* os
  assets antes de montar a cena. Detalhes em
  [IA com Claude Code](#ia-claude-code).
- **Auto-rig** — riggar personagens para animação.
- **Scripts** — quando você pede um modelo novo ou um ajuste num
  `.glb`, o Claude Code escreve um script Python para o Blender e
  roda por conta própria.

<div class="callout callout-warn">

**Sem Blender instalado, essas funções não funcionam.** A IDE **não
embute** o Blender — depende do executável instalado na sua máquina.
O resto (editor, preview, export e as demais tools do MCP) funciona
normalmente sem ele. O instalador do Studio checa o Blender no fim da
instalação e avisa se ele faltar.

</div>

## Instalar Blender

| SO | Como instalar |
|---|---|
| **Windows** | Baixar em [blender.org/download](https://www.blender.org/download/) e rodar o instalador. |
| **macOS** | `brew install --cask blender` ou baixar o `.dmg` em [blender.org/download](https://www.blender.org/download/). |
| **Linux** | `sudo apt install blender` (Debian/Ubuntu) ou via Flatpak / pacote da sua distro. |

**Versão exigida: Blender 4.0 ou mais novo.** Os scripts assumem a
API moderna (modificadores Boolean com solvers `EXACT`/`MANIFOLD`,
exporter glTF atual). Blender 3.x não é suportado.

## Configurar o caminho do executável

A IDE procura o Blender em três fontes, nessa ordem:

1. **Variável de ambiente `BLENDER_PATH`** — caminho absoluto pro
   executável. Tem prioridade.
2. **Pastas de instalação comuns** — por exemplo
   `C:\Program Files\Blender Foundation\Blender 4.x\` no Windows.
3. **Comando `blender` no PATH** — se as opções anteriores não
   acharem.

### Windows

O instalador do Blender **não adiciona o `blender.exe` ao PATH por
padrão**. Se a pasta de instalação padrão não for encontrada, você
tem duas opções:

#### Opção A: definir `BLENDER_PATH` (mais simples)

1. Abrir **Configurações do sistema → Variáveis de ambiente**
   (ou pesquisar "variáveis de ambiente" no menu Iniciar).
2. Em "Variáveis de usuário", clicar **Nova...**
3. Nome: `BLENDER_PATH`
4. Valor: caminho completo do executável, normalmente
   `C:\Program Files\Blender Foundation\Blender 4.2\blender.exe`
   (ajustar o número da versão).
5. **Fechar e reabrir a IDE e o Claude Code** — processos em execução
   não veem mudanças de ambiente feitas depois que iniciaram.

#### Opção B: adicionar ao PATH

1. Mesma tela de "Variáveis de ambiente".
2. Editar a variável **Path** (do usuário).
3. Adicionar `C:\Program Files\Blender Foundation\Blender 4.2\`
   (a pasta, sem o `blender.exe` no final).
4. Reabrir a IDE e o Claude Code.

### macOS

`brew install --cask blender` já cuida do PATH — o comando `blender`
fica disponível em qualquer terminal.

Se você baixou o `.app` manualmente, defina `BLENDER_PATH` apontando
pro binário dentro do bundle:

```bash
export BLENDER_PATH="/Applications/Blender.app/Contents/MacOS/Blender"
```

Adicione no `~/.zshrc` ou `~/.bash_profile` pra persistir.

### Linux

`apt install blender` (ou equivalente) registra `blender` no PATH —
nada extra a fazer.

## Validar

No terminal embutido da IDE (ou em qualquer terminal externo, depois
reiniciar a IDE):

```bash
blender --version
```

Deve imprimir algo como `Blender 4.2.0`. Se aparecer
"command not found" ou similar, o PATH/`BLENDER_PATH` ainda não está
correto.

## Como usar com a IA

Com o Claude Code aberto na pasta do projeto, peça com naturalidade:

> "Inspecione os modelos de `assets/props/` e me diga quais servem
> de obstáculo."

> "Crie uma espada medieval com lâmina metálica polida e cabo de
> madeira, em escala real, e salve em `assets/sword.glb`."

No primeiro caso, o Claude Code chama `inspect_assets` e olha as
thumbnails e as medidas. No segundo, ele escreve o script do Blender,
roda e confere o resultado com `measure_glb`. Você não precisa citar
o Blender nem as tools. O Claude Code pede aprovação antes de rodar
comandos, conforme as suas configurações de permissão.

Logo depois você pode pedir para ele colocar o modelo na cena via
`AssetLoader`.

## Limitações

- **Tempo**: rodar o Blender em modo headless leva alguns segundos
  por chamada. Não é instantâneo.
- **Complexidade**: modelos gerados por script (personagem humanoide
  com rig, arquitetura complexa) geralmente saem aproximados.
  Funcionam bem pra props, terrenos simples e formas estilizadas —
  para o resto, prefira os kits do engine (`list_kits` / `import_kit`).
- **Determinismo**: o mesmo pedido **não** gera o mesmo modelo duas
  vezes. Se você curtiu o resultado, guarde o `.glb` (e peça ao
  Claude Code para salvar o script no projeto).

## Eu não vou usar Blender, posso pular?

Pode. Você ainda escreve componentes, sistemas e cenas em
TypeScript normalmente, usa os kits do engine e carrega `.glb` que
você produziu em outro lugar via `AssetLoader`. Sem o Blender, você
só perde o `inspect_assets`, o auto-rig e a criação de modelos por
script.
