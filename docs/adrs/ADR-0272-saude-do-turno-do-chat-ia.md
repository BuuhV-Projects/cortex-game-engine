# ADR-0272 — Saúde do turno do Chat IA: mostrar sempre, matar só o processo mudo

**Data:** 2026-09-24
**Status:** aceito

## Contexto

Caso real (cenário tropical do crash-bandicoot-racer): o Astra respondeu, e o
turno seguiu por minutos validando 18 modelos sem nada na tela — só o botão
"Parar" ativo. O usuário não tinha como saber se a IA trabalhava, esperava ou
tinha travado.

Dois buracos:

1. **O indicador "Pensando…" some no primeiro texto** da IA e não volta mais
   no turno. Tudo que acontece depois (comandos longos, validação, correção de
   modelo) fica sem sinal de vida.
2. **O processo do Astra não tem limite nenhum.** Se o `codex exec` pendura, o
   turno fica aberto até alguém clicar Parar. Falha que *encerra* o processo já
   chega ao chat como erro; a que o *pendura* não.

## Decisão

### 1. Barra de saúde do turno (renderer, as duas cabeças)

Enquanto o turno roda, uma barra fixa acima da caixa de texto mostra:

- tempo total do turno;
- o passo em andamento — o card mais recente ainda sem resultado
  (ex.: `Validação — Validando modelo 3/18: …`);
- tempo desde a última atividade (texto, card aberto, card fechado).

Três níveis, por tempo sem atividade:

| sem atividade | nível | o que diz |
| --- | --- | --- |
| < 1 min | trabalhando | tempo do turno + passo |
| ≥ 1 min | quieto | + "sem novidade há X" |
| ≥ 5 min | parado | "pode ter travado" + orientação de usar Parar |

A regra é pura (`electron/renderer/turnHealth.ts`), testada sem a UI.

### 2. Vigia do processo do Astra (main)

Cada linha de saída do `codex exec` (stdout ou stderr) zera um relógio. Com
**15 min** sem nenhuma, o Studio encerra o processo e o turno termina com erro
dizendo isso. No Orquestrador o erro volta como resultado da delegação e o
Claude segue.

### Alternativas descartadas

- **Matar no nível "parado" (5 min)** — há passos legítimos longos e mudos: um
  comando de Blender, um build, a inspeção de um modelo grande. Matar cedo
  perderia trabalho bom; avisar e deixar o usuário decidir não perde nada.
- **Vigia também na cabeça Claude** — o Agent SDK e as tools (`playtest_game`,
  validação) já têm limites próprios; o processo sem limite confirmado é o do
  Codex. Sem caso medido, não entra.
- **Ping de "vivo" do main para o renderer** — a atividade que já chega pelos
  eventos do chat é o sinal; um segundo canal só repetiria o mesmo.

## Consequências

- O usuário sempre vê que o turno está vivo, quanto tempo passou e em que passo.
- Um turno do Modelagem pendurado termina sozinho em 15 min, com mensagem.
- Os limites (1 min, 5 min, 15 min) são constantes nomeadas; ajustar é trocar
  o número, sem mexer no fluxo.
