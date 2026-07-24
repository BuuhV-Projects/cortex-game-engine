# 0150 - Export: o dev escolhe a pasta de saída

**Data:** 2026-07-24
**Status:** aceito

## Contexto

O export nativo (ADR-0101) salvava sempre em `<projeto>/dist-native`, fixo. Dois
problemas: (1) o dev não conseguia manter várias versões nem exportar direto pra
uma pasta de distribuição; (2) quando a `dist-native` ficava **travada** (o jogo
exportado aberto, o Explorer, ou o antivírus/Defender segurando um handle de
kernel), o export abortava no passo de limpeza (`prepareDist` esvazia a pasta) e
não havia saída a não ser caçar o processo dono do handle — que às vezes nem
`rename`/`takeown`/mover resolvem.

## Decisão

**O dev escolhe onde salvar.**

- **CLI** (`export-game.mjs`): flag `--out <dir>`. Omitida = `dist-native` (o
  default histórico, pra não quebrar scripts).
- **IDE** (Studio): ao exportar, abre por **padrão** o seletor de pasta nativo.
  Cancelar o seletor cancela o export.

⚠️ **O export ESVAZIA a pasta de saída** (`prepareDist`, ADR-0101). Por isso a IDE
**nunca** usa a pasta escolhida direto — criaria o risco de apagar o conteúdo dela.
O jogo vai num **subdir dedicado** `<pasta escolhida>/<nome do projeto>`, seguro
pra reexportar por cima. No CLI, `--out` é o destino exato (responsabilidade de
quem chama; use uma pasta dedicada).

**Recuperação de lock:** quando o export falha porque a pasta está travada
(`EPERM/EBUSY/EACCES` / "TRAVADO" na saída), o modal oferece **exportar pra outra
pasta** — o dev escolhe um destino livre e o export refaz na hora, sem precisar
fechar o processo que segura o handle. Sem loop: cada tentativa espera a interação
do dev; cancelar encerra.

## Consequências

- Fluxo do menu "Exportar ›" agora tem um passo a mais (escolher pasta). Se no
  futuro isso incomodar, dá pra lembrar a última pasta e sugerir como default.
- O lock de `dist-native` (que motivou isto — um handle de kernel/Defender que
  nem `takeown` liberava) deixa de ser um beco sem saída: exportar pra outra pasta
  contorna na hora.
- `guardLocks`/`prepareDist` (ADR-0101) seguem iguais — a mudança é só de para
  ONDE se exporta, não de COMO se limpa/escreve.
