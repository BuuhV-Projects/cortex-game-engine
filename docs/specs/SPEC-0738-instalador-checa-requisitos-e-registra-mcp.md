# SPEC-0738 - Instalador checa os requisitos e registra o MCP

**Data:** 2026-11-14
**Status:** aceito

## Contexto

O instalador (NSIS do electron-builder) instala o Studio sem olhar a máquina. O dev só descobre que falta
Blender, Git ou o Claude Code quando uma função quebra. Com o ADR-0736, o MCP `cortex` também precisa ser
registrado no Claude Code para a IA enxergar o Studio.

## Decisão

### `cortex-setup` (CLI, `mcp/setup/`)

Bundle `resources/mcp/cortex-setup.mjs`, rodado com o exe do Studio em modo Node
(`ELECTRON_RUN_AS_NODE=1`).

| Flag | Efeito |
|---|---|
| `--check` | verifica os requisitos |
| `--register` | `claude mcp remove --scope user cortex` (se houver) e `claude mcp add --scope user cortex -e ELECTRON_RUN_AS_NODE=1 -- "<exe>" "<resources>/mcp/cortex-mcp.mjs"` |
| `--unregister` | remove o registro |
| `--json` | saída em JSON (o instalador usa o texto) |
| `--report <arquivo>` | grava o relatório em texto (o instalador mostra no fim) |

Código de saída: `0` tudo ok; `1` faltou requisito obrigatório ou o registro falhou; `2` erro do próprio
setup.

### Requisitos

| Requisito | Como verifica | Nível | Para que serve |
|---|---|---|---|
| Claude Code ≥ 2.0 | `claude --version` (pelo `where`/`which`) | obrigatório para IA | usar o MCP |
| Blender ≥ 4.0 | `blenderLocate` + `blender --version` | recomendado | `inspect_assets`, auto-rig, scripts das skills |
| Git | `git --version` | recomendado | commit inicial do projeto, Git Bash do auto-rig |

Cada item informa: encontrado ou não, versão, caminho e link de instalação. A checagem é pura: os
comandos entram por parâmetro (`run(cmd, args)`), para testar sem a máquina.

### Instalador (`build/installer.nsh`, `nsis.include`)

- `customInstall`: liga `ELECTRON_RUN_AS_NODE=1` no ambiente do instalador, roda
  `cortex-setup --check --register --report $INSTDIR\requisitos.txt` e mostra o relatório numa
  `MessageBox` (ícone de aviso quando o código for diferente de 0). A instalação não é desfeita: o
  editor funciona sem os requisitos de IA, e o relatório diz o que instalar e como registrar depois.
- `customUnInstall`: `cortex-setup --unregister` (silencioso, best-effort).
- Instalação silenciosa (`/S`) não abre a caixa; o relatório fica em `$INSTDIR\requisitos.txt`.

O NSIS não checa nada antes de copiar os arquivos (ADR-0736, alternativas).

## Consequências

- Reinstalar atualiza o caminho do exe no registro do MCP.
- Sem o Claude Code, o registro fica pendente; depois de instalar, rodar
  `"<Studio>.exe" resources/mcp/cortex-setup.mjs --register` com `ELECTRON_RUN_AS_NODE=1` (o README
  traz o comando pronto).
- O README passa a listar estes requisitos; o Codex CLI deixou de ser requisito.
- Atualização (`isUpdated`) não desregistra: o instalador novo registra de novo com o exe novo.
- Instalação elevada como outro usuário registraria no usuário errado (`--scope user`); a instalação
  padrão é por usuário.
- O relatório é gravado em UTF-16LE com BOM (o NSIS Unicode lê acentos e ✓/✗ com `FileReadUTF16LE`), e a
  caixa mostra até 700 caracteres mais o caminho do relatório completo.
