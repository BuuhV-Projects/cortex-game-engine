# SPEC-0266 — Modos Modelagem e Codificar, fronteira de código e regras de performance

**Data:** 2026-09-24
**Status:** aceito
**Decisão:** ADR-0265

## Contexto

Implementação dos itens 1, 2 e 4 do ADR-0265. O portão de modelo 3D (item 3)
está na SPEC-0267.

## Decisão

### Seletor

O botão de modelo do chat alterna entre dois modos:

| modo (UI) | `AgentModel` enviado |
| --- | --- |
| Modelagem | `astra` |
| Codificar | `sonnet`, ou `opus` com o ajuste ligado |

Persistência por projeto na chave existente `chat_model:<dir>`. Valores salvos
antes desta spec: `astra` → Modelagem; `sonnet`/`opus`/`haiku` → Codificar.

O ajuste "Codificar com o modelo mais forte" fica na janela de configurações do
projeto, com o aviso de que consome a cota bem mais rápido. Guardado em
`localStorage` (`chat_codificar_forte:<dir>`), **não** no `cortex.json` — é
preferência do Studio, não dado do jogo.

Nenhum texto da UI cita Astra, Sonnet, Opus, Haiku, GPT ou Codex.

### Fronteira do Modelagem (`electron/agent/codex/codeGuard.ts`)

- **Código:** extensões `.ts .tsx .js .jsx .mjs .cjs`.
- **Ignorado na varredura:** `node_modules`, `vendor`, `dist`, `out`, `.git`,
  `.cortex`.
- Antes do turno: `snapshotCode(raiz)` lê o conteúdo de cada arquivo de código.
- Depois do turno: `restoreCode(raiz, foto)` desfaz cada diferença — reescreve
  o que mudou, recria o que foi apagado, apaga o que foi criado — e devolve a
  lista de caminhos afetados.
- Se a lista não for vazia, o chat recebe um aviso em texto: quais arquivos, e
  que código é trabalho do modo Codificar.
- Em modo `plan` o sandbox já é somente leitura; o guarda roda igual (barato).

### Preâmbulo do Modelagem (`electron/agent/codex/modelagemPreamble.ts`)

Texto curto posto antes do pedido do usuário em todo turno do Astra:

1. O que o modo faz (modelos, cenários, efeitos declarados em dado, performance
   dos dados 3D) e o que não faz (código — dizer ao usuário para usar Codificar).
2. As regras de performance (abaixo).
3. "Antes de encerrar, revise o que fez contra as regras de performance e diga
   em uma linha o resultado."

### Regras de performance (as mesmas nas duas cabeças)

Fonte única: `electron/agent/performanceRules.ts`, usada pelo `prompt.ts` do
Claude e pelo preâmbulo do Astra. Conteúdo:

1. **Modelo 3D:** o custo é material, não triângulo (SPEC-0224). No máximo 4
   materiais em peça pequena, 8 em objeto grande; acabamentos iguais dividem
   material.
2. **Aquecer depois de criar:** `game.precompile()` sob a tela de carregamento
   opaca, DEPOIS de criar tudo que só nasce no uso (efeitos, projéteis).
   Objeto criado no meio do jogo compila shader na hora e trava (ADR-0262).
3. **Pool, não criação no uso:** efeitos e projéteis nascem no carregamento e
   voltam a um pool. `InstancedMesh` gera um shader por objeto — um novo em
   jogo é uma compilação.
4. **Um caminho de render a mais é outro aquecimento:** se o jogo desenha a
   cena num `pass()` próprio (pós-processamento que liga por estado), force
   esse caminho e chame `game.precompile()` de novo.
5. **Teto de fps é do jogo:** `game.maxFps`, de preferência divisor do refresh
   (`game.refreshHz`).

E, no prompt do Claude, a instrução de encerramento: "Antes de encerrar o
turno, revise o código que escreveu contra as regras de performance e diga em
uma linha o resultado."

## Consequências

- Testes: `tests/electron/codeGuard.test.ts` (restaura editado, recriado e
  criado; ignora as pastas excluídas; não mexe em dado), e testes do mapeamento
  modo → `AgentModel` e da leitura de valores salvos antigos.
- O guarda lê todos os arquivos de código do projeto a cada turno do Modelagem.
  Projetos de jogo têm poucas centenas; `vendor` e `node_modules` ficam fora.
