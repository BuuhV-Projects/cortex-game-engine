# Ícones do jogo

Quando você gera o instalador, o `.exe` carrega **dois ícones que
você controla**:

- **Ícone do instalador** — o que aparece no `.exe` baixado e na
  janela do wizard de instalação.
- **Ícone do jogo** — o que aparece na barra de tarefas, no canto
  da janela do jogo e no atalho da Área de Trabalho depois de
  instalado.

Por padrão, ambos vêm de um placeholder cinza-azulado gerado
automaticamente pela IDE. Trocar por arte real é um único comando.

## Onde os ícones ficam

Dentro do projeto:

```
seu-jogo/
└── src-tauri/
    └── icons/
        ├── 32x32.png         ícone pequeno (taskbar, file explorer)
        ├── 128x128.png       ícone médio (Iniciar, atalhos)
        ├── 128x128@2x.png    versão 256×256 (high-DPI)
        └── icon.ico          ícone Windows (instalador + .exe)
```

O `tauri.conf.json` referencia esses arquivos no campo `bundle.icon`.
Você não precisa editar essa lista — só substituir os arquivos.

## Gerar do seu próprio PNG

O CLI do Tauri tem um comando que gera todos os tamanhos a partir
de **um único PNG fonte**. Roda no terminal embutido da IDE:

```bash
yarn tauri icon caminho/para/icone.png
```

Substitui automaticamente os 4 arquivos em `src-tauri/icons/`.

### Requisitos do PNG fonte

| Item | Valor recomendado |
|---|---|
| Tamanho | **1024×1024** (quadrado) |
| Formato | PNG com transparência (canal alpha) |
| Conteúdo | Logo/símbolo centralizado, com margem interna |

<div class="callout callout-warn">

**Quadrado obrigatório.** PNG retangular vai gerar ícones distorcidos
nos tamanhos menores. Se sua arte original é retangular, abra num
editor (Figma, Photoshop, GIMP) e coloque num canvas 1024×1024 antes.

</div>

### Onde colocar o PNG fonte

Convenção sugerida: salvar em `assets/branding/icon.png` dentro do
projeto. Esse caminho fica versionado no git e fácil de iterar
quando a arte mudar:

```bash
yarn tauri icon assets/branding/icon.png
```

## Testar o resultado

Depois de gerar:

1. **Menu → Projeto → Gerar instalador...** — empacota o `.exe`
   com os ícones novos.
2. Abrir `src-tauri/target/release/bundle/nsis/` no Explorer — o
   próprio ícone do `_setup.exe` já reflete o que você gerou.
3. Rodar o `_setup.exe` — o wizard de instalação usa o mesmo
   ícone.
4. Após instalar, abrir o jogo — o ícone aparece na barra de
   tarefas e no canto da janela.

<div class="callout callout-info">

**Dica.** O Windows agressivamente cacheia ícones. Se você
regenerou e ainda vê o placeholder antigo no Explorer, esvazie o
cache: rodar `ie4uinit.exe -show` no terminal, ou reiniciar o
Explorer pelo Gerenciador de Tarefas.

</div>

## Configurar nome e título da janela

O nome que aparece em **título da janela do jogo**, **menu Iniciar**
e **adicionar/remover programas** vem do `tauri.conf.json`:

```json
{
  "productName": "Meu Jogo Maneiro",
  "version": "0.0.1",
  "app": {
    "windows": [
      {
        "title": "Meu Jogo Maneiro",
        "width": 1280,
        "height": 720
      }
    ]
  }
}
```

Por padrão, ambos os campos vêm preenchidos com o nome do projeto.
Trocar a qualquer momento — a próxima chamada de
**Gerar instalador...** pega a mudança.

## Vou trocar o ícone depois — perco coisa?

Não. `yarn tauri icon` sobrescreve os 4 arquivos em
`src-tauri/icons/`, e o próximo build incremental do Rust pega
imediatamente. O ciclo "trocar ícone → buildar" leva os mesmos ~30
segundos de um build incremental normal.
