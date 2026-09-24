# ADR-0265 — Chat IA por tarefa: modo Modelagem e modo Codificar

**Data:** 2026-09-24
**Status:** aceito (roteamento automático revisto no ADR-0269 — modo Orquestrador)
**Substitui em parte:** ADR-0191 (o seletor de modelo)

## Contexto

O ADR-0191 deu duas cabeças ao Chat IA — o GPT-6-Astra (via Codex CLI) monta
cena, o Claude escreve código — e pôs a escolha num seletor de **modelo**:
`sonnet → opus → haiku → astra`. Três problemas apareceram no uso:

1. **O seletor fala a língua errada.** Quem usa o Studio quer "montar o
   cenário" ou "programar a mecânica", não escolher entre quatro nomes de
   modelo. E nada impede escolher o Astra e pedir código, ou o Haiku e pedir
   um cenário.
2. **Não há fronteira.** Rodando como agente no projeto, o Astra edita qualquer
   arquivo — inclusive o código do jogo, que é onde o Claude, com as skills e o
   índice da API (ADR-0180, ADR-0114), é o mais forte.
3. **Modelo 3D sai sem portão.** A SPEC-0231 mede e refina todo modelo gerado,
   mas não reprova nada: um carro com um material por peça (o caso medido no
   kart-racer, SPEC-0224) é entregue igual. A validação informa; ninguém age.

E a campanha de performance do kart-racer deixou regras de runtime (aquecer
depois de criar os efeitos, pool em vez de criar no uso, cuidado com
`InstancedMesh` e com um segundo caminho de render) que nenhuma das cabeças
conhece — um jogo novo repetiria os erros.

## Decisão

### 1. O usuário escolhe a TAREFA, não o modelo

Dois modos no seletor do chat, sem nome de modelo em lugar nenhum da UI:

| modo | quem roda | para quê |
| --- | --- | --- |
| **Modelagem** | GPT-6-Astra (Codex CLI) | modelos 3D, cenários, efeitos no cenário e nos modelos, performance dos dados 3D |
| **Codificar** | Claude (Agent SDK) | código do jogo: sistemas, scripts, mecânicas, UI |

O Codificar usa **Sonnet por padrão** (ADR-0130: a cota do Opus no plano de
assinatura é bem menor e estourava rápido) e oferece **Opus como ajuste
opcional** nas configurações do projeto — guardado no Studio, não no
`cortex.json`, que vai junto no export do jogo.

Haiku sai da UI. O tipo `AgentModel` continua aceitando os quatro valores —
só o seletor muda.

### 2. Modelagem não escreve código — e isso é garantido, não pedido

O Modelagem trabalha em **dado**: `scenes/*.json`, overlays de cena, assets
(`.glb`, texturas, `.kit.json`), materiais e efeitos declarados nos nós. Código
(`.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.jsx`) é do Codificar.

A regra vai no preâmbulo do turno do Astra, e é **garantida** por um guarda:
antes do turno, o Studio fotografa os arquivos de código do projeto; depois,
restaura qualquer um que o Astra criou, editou ou apagou, e avisa no chat que
aquilo é trabalho do modo Codificar.

Por que garantir em vez de só instruir: o custo de o Astra editar código não
aparece na hora — o jogo pode até rodar — e o usuário não saberia que a
fronteira foi cruzada. Um guarda determinístico torna a divisão confiável.

### 3. Modelo 3D passa por um portão, e reprovado volta para o Astra

Todo `.glb` novo ou alterado — pela tool `generate_blender_model` ou por um
turno do Modelagem — passa por refino + inspeção (SPEC-0231) e então por
critérios de aprovação. Reprovado, volta automaticamente ao Astra com o motivo,
até um limite de tentativas; esgotado o limite, o modelo é entregue com os
problemas listados, para o usuário decidir.

Critérios na SPEC-0267. O essencial vem da medida do kart-racer: o custo é
**material**, não triângulo.

### 4. As duas cabeças conhecem as regras de performance e as revisam no fim

As regras de runtime entram no prompt do Claude e no preâmbulo do Astra, e as
duas cabeças terminam cada turno **revisando o que fizeram contra elas**.

### Alternativas descartadas

- **Roteamento automático por conteúdo do pedido** — já rejeitado no ADR-0191:
  classificar "é cena ou é código?" por texto erra em silêncio.
- **Fronteira só no prompt** — o Astra obedeceria na maioria das vezes, e a
  exceção seria invisível.
- **Portão que só avisa** — é o que existe hoje (SPEC-0231), e o problema
  medido continuou chegando ao jogo.

## Consequências

- O usuário não precisa saber que existem Astra, Sonnet ou Opus.
- Um pedido de código no Modelagem não é atendido pela metade em silêncio: o
  guarda desfaz e diz para trocar de modo.
- Gerar modelo 3D pode levar mais tempo (até o limite de tentativas) — em
  troca, o que chega ao jogo passou pelos critérios.
- Trabalho de uma tarefa que precisa de dado E código (ex.: um efeito com
  script de animação) exige os dois modos, um depois do outro.
