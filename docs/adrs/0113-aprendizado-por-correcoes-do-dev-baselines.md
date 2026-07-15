# 0113 - Aprendizado por correções do dev (baselines + diff semântico)

**Data:** 2026-07-15
**Status:** aceito

## Contexto

Quando a IA gera uma fase e o dev corrige no editor, essas correções — o feedback
mais rico que existe sobre a qualidade do level design — eram descartadas: nada
conectava o overlay editado à IA (lacuna registrada na exploração dos ADRs 0037/
0039/0043, onde toda lição virava instrução de prompt escrita à mão). O substrato
sempre esteve pronto: as edições do dev caem no overlay (`scene-data*.json`)
chaveadas pelo mesmo `id` que a IA autora (ADR-0044/0094).

Decisão de método (discutida com o usuário): **destilar correções em regras/texto
versionado, não fine-tuning** — com poucas correções por fase, uma única edição já
vira lição imediata e inspecionável; fine-tuning exige milhares de exemplos, é
opaco e não-corrigível. E o alvo preferencial de aprendizado é **código**
(threshold/regra do validate_scene), que nunca regride.

## Decisão

1. **Baseline por fase** (`.cortex/baselines/<fase>.json`): snapshot do **estado
   efetivo** da cena (nós + overlay resolvidos por id: posição/rotY/escala/física/
   collider/role) + hash do overlay. `electron/agent/learning.ts`.
2. **Diff semântico determinístico** (`diff_corrections`): estado atual − baseline,
   agrupado por `role × tipo de mudança` com médias e tendência de eixo ("hazard:
   4× moved, média 1.3u, tendência X+"). O diff completo vai pra
   `.cortex/learning/`; **só o resumo entra no contexto** (limite de contexto do
   chat é restrição de projeto — nunca ler overlay cru).
3. **Gatilhos explícitos, detecção assistida** (o dev controla o aprendizado):
   - **Botão 🎓 no Chat** (renderer) — manda a mensagem canônica de aprendizado;
   - **Oferta na abertura de sessão** — o main roda `detectPendingCorrections`
     (comparação de hash, custo ~zero) e o agente oferece UMA vez, sem spam;
   - **Pedido em texto** ("aprende com meus ajustes").
4. **Lições passam pelo dev antes de gravar** (transparência/veto): o agente
   propõe o que vai registrar; aprovado → regra geométrica vira ajuste no
   validate_scene, lição de estilo vai pro `.cortex/scene-learnings.md`
   (deduplicada, teto ~200 linhas com consolidação — o arquivo entra no contexto
   toda sessão).
5. **Baseline SEMPRE avança ao fim do ciclo** — inclusive com veto (veto é sobre
   a lição, não sobre o marco de comparação; sem isso o mesmo diff é re-oferecido
   pra sempre) e a cada nova edição de cena pela IA (`save_baseline` na entrega).
   Invariante: *o baseline reflete o último estado que a IA conhece e considera
   processado; o diff mede somente a intervenção humana desde então*.

## Consequências

- A IA melhora **entre projetos e sessões** sem treino: correção vira regra de
  validador (determinística) ou memória curta versionável — ambas inspecionáveis
  e apagáveis, ao contrário de pesos.
- Nem toda edição é princípio (gosto pontual existe) — por isso o veto humano no
  passo 4; o custo é um toque de fricção por ciclo de aprendizado.
- O diff é cego pra MOTIVO: sabe que hazards foram afastados, não POR QUÊ. A
  interpretação (lição) é do LLM com aprovação do dev — o determinismo fica na
  medição, a semântica no par IA+dev.
- Baselines/diffs ficam em `.cortex/` (fora do build; versionável a critério do
  projeto).
- Relaciona-se com: ADR-0044/0094 (overlay por id/por fase — a fonte de sinal),
  ADR-0112 (destino preferencial das regras), ADR-0053 §4 (persistência
  semântica de kit — mesma filosofia de "conhecimento estável, não re-derivado").
