# Blender (gerador de modelos 3D)

A IDE consegue gerar modelos 3D (`.glb`) a partir de **descrição em
linguagem natural** — você pede no chat IA, a Claude escreve um
script Python para o Blender, o Blender roda em modo headless e
devolve o asset pronto pra cair na cena.

<div class="callout callout-warn">

**Sem Blender instalado, essa funcionalidade não funciona.** A IDE
**não embute** o Blender — depende do executável instalado na sua
máquina. Os outros recursos (editor, preview, chat IA pra código,
gerar instalador) funcionam normalmente sem ele.

</div>

## Instalar Blender

| SO | Como instalar |
|---|---|
| **Windows** | Baixar em [blender.org/download](https://www.blender.org/download/) e rodar o instalador. |
| **macOS** | `brew install --cask blender` ou baixar o `.dmg` em [blender.org/download](https://www.blender.org/download/). |
| **Linux** | `sudo apt install blender` (Debian/Ubuntu) ou via Flatpak / pacote da sua distro. |

**Versão recomendada: Blender 4.x.** O system prompt do gerador
assume a API moderna (modificadores Boolean com solvers `EXACT`/
`MANIFOLD`, exporter glTF atual). Blender 3.x pode até funcionar
mas é instável.

## Configurar o caminho do executável

A IDE procura o Blender em duas fontes, nessa ordem:

1. **Variável de ambiente `BLENDER_PATH`** — caminho absoluto pro
   executável. Tem prioridade.
2. **Comando `blender` no PATH** — se a primeira opção não estiver
   definida.

### Windows

O instalador do Blender **não adiciona o `blender.exe` ao PATH por
padrão**. Você tem duas opções:

#### Opção A: definir `BLENDER_PATH` (mais simples)

1. Abrir **Configurações do sistema → Variáveis de ambiente**
   (ou pesquisar "variáveis de ambiente" no menu Iniciar).
2. Em "Variáveis de usuário", clicar **Nova...**
3. Nome: `BLENDER_PATH`
4. Valor: caminho completo do executável, normalmente
   `C:\Program Files\Blender Foundation\Blender 4.2\blender.exe`
   (ajustar o número da versão).
5. **Fechar e reabrir a IDE** — processos em execução não veem
   mudanças de ambiente feitas depois que iniciaram.

#### Opção B: adicionar ao PATH

1. Mesma tela de "Variáveis de ambiente".
2. Editar a variável **Path** (do usuário).
3. Adicionar `C:\Program Files\Blender Foundation\Blender 4.2\`
   (a pasta, sem o `blender.exe` no final).
4. Reabrir a IDE.

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

## Como usar dentro da IDE

No chat IA da sidebar, descreva o asset com naturalidade:

> "Crie uma espada medieval com lâmina metálica polida e cabo de
> madeira. Salve em `assets/sword.glb`."

> "Gere um pneu de carro estilo cartoon e salve em
> `assets/wheel.glb`."

O agente decide quando chamar a tool `generate_blender_model` —
você não precisa mencionar Blender explicitamente. Tools de geração
de asset pedem aprovação (modo `ask`) antes de rodar, então você vê
o pedido no card e aprova.

O `.glb` cai no caminho que você pediu (dentro do projeto). Logo
depois você pode pedir pro mesmo chat IA carregar o modelo na cena
via `AssetLoader`.

<div class="callout callout-info">

**Script Python salvo pra debug.** Junto com o `.glb`, o gerador
salva o script Python que produziu o modelo num arquivo temporário
(`%TEMP%\blender_gen_<timestamp>.py` no Windows). Quando algum
modelo sai estranho ou o Blender crasha, esse arquivo permite
reproduzir e ajustar manualmente.

</div>

## Limitações

- **Tempo**: cada geração leva ~10–30 segundos (Claude pensa o
  script + Blender roda headless). Não é instantâneo.
- **Complexidade**: modelos detalhados (personagem humanoide com
  rig, arquitetura complexa) geralmente saem aproximados. Funciona
  bem pra props, terrenos simples, formas estilizadas.
- **Sem texturas externas**: o gerador usa Principled BSDF com
  cores sólidas e parâmetros PBR (Metallic/Roughness). Texturas
  bitmap não entram nesta versão.
- **Determinismo**: o mesmo prompt **não** gera o mesmo modelo duas
  vezes — Claude reescreve o script a cada chamada. Se você curtiu
  o resultado, guarde o `.glb` e o script Python salvo no `%TEMP%`.

## Eu não vou usar IA pra modelos, posso pular?

Pode. Você ainda escreve componentes, sistemas e cenas em
TypeScript normalmente, e carrega `.glb` que você produziu em
outro lugar via `AssetLoader`. O Blender só é exigido se você
quiser **gerar** modelos pela IDE.
