# 0007 - Protocolo de medição A/B do export nativo

**Data:** 2026-09-23
**Status:** aceito

## Contexto

A campanha de perf do kart-racer entregou correções que **não puderam ser
validadas**. O motivo não é falta de instrumento — é o método de medir.

Medindo o **mesmo** build (`kr-var`) em dois momentos diferentes, com o mesmo
roteiro (`?bench`, a IA pilotando):

| medição | fps mediano |
| --- | --- |
| primeira | 49,7 |
| segunda | **57,2** |

**15% de variação sem mudar uma linha.** Qualquer correção que renda menos que
isso fica invisível, e — pior — pode parecer regressão ou ganho por sorteio.

Foi o que aconteceu com as SPECs 0016 a 0019: quatro correções corretas pelo
mecanismo e travadas por teste, nenhuma com ganho medido de ponta a ponta.

Três causas identificadas:

| causa | efeito |
| --- | --- |
| **trajetória** | a IA não percorre exatamente o mesmo caminho; quantos carros e pickups entram em quadro muda entre rodadas |
| **estado da máquina** | rodar A depois de B, sempre nessa ordem, dá vantagem a quem correu com a GPU já aquecida (ou desvantagem, se houve throttling) |
| **amostra curta** | uma ou duas rodadas de 85 s, e comparação por **média**, que uma travada isolada desloca |

## Decisão

`native/scripts/ab-bench.ps1` e `native/scripts/ab-report.mjs`: um protocolo
A/B em duas peças — coleta e análise separadas, para que a análise possa ser
refeita sem rodar o jogo de novo.

### Coleta: rodadas intercaladas

`ab-bench.ps1 -A <dir> -B <dir> -Rodadas 4` executa **A B A B A B A B**, não
AAAA BBBB. A deriva da máquina (temperatura, outros processos) atinge as duas
versões igualmente, em vez de se somar a uma delas.

Cada rodada lança pelo PowerShell (é o único jeito de o launcher abrir janela
de verdade), com `CORTEX_LAUNCH_QUERY=bench` para a IA pilotar, e salva o
`perf-trace.jsonl` com nome que identifica versão e rodada.

### Análise: binning por draws

O relatório **não compara médias**. Ele agrupa os frames por faixa de draws e
compara **dentro de cada faixa**.

É o que neutraliza a trajetória: se numa rodada a IA viu mais carros, isso
muda quantos frames caem em cada faixa, mas não muda o custo de um frame *com
aquele número de draws*. A comparação passa a ser "mesmo trabalho na tela,
quanto custa" — que é a pergunta.

Esse método já tinha achado sinal onde a média não achava: o culling de
contorno apareceu como −1,10 ms na faixa de 160–190 draws enquanto a média
geral dizia +0,10 ms.

### Veredito: bootstrap, não olhômetro

Para cada faixa, a diferença de medianas vem com **intervalo de confiança de
95% por bootstrap** (reamostragem com reposição). Bootstrap porque a
distribuição de frame time não é normal — tem cauda longa à direita — e
porque ele não exige supor nada sobre ela.

O veredito de cada faixa é literal:

| condição | veredito |
| --- | --- |
| IC inteiramente abaixo de zero | **melhora** |
| IC inteiramente acima de zero | **piora** |
| IC cruza zero | **indistinguível** |

"Indistinguível" é um resultado, não uma falha. É a informação que faltou nas
últimas quatro correções.

### Descarte de aquecimento

Os primeiros `TEMPO_DE_AQUECIMENTO_MS` de cada rodada são jogados fora: carga
de cena, compilação de pipeline e a largada não representam o regime que se
quer medir.

## Consequências

- Uma comparação passa a custar 8 rodadas (~15 min) em vez de 2 (~4 min). É o
  preço de saber; o barato anterior produziu quatro correções não validadas.
- O relatório roda sobre traces já salvos, então dá para reanalisar com outro
  binning ou outra métrica sem tocar no jogo.
- **Não elimina a variação** — mede-a. Se o IC continuar cruzando zero mesmo
  com 8 rodadas, a resposta honesta é que o efeito é menor que o ruído, e aí a
  decisão de mesclar passa a ser sobre o mecanismo, explicitamente.
- É Windows-only, como o resto do caminho nativo.

## Validação do próprio protocolo

O relatório decide se uma mudança valeu. Se ele estiver errado, todo número que
sair dele está errado junto — e esta campanha já perdeu tempo com instrumento
que mentia em silêncio. Por isso ele foi exercitado contra **casos de resposta
conhecida** antes de ser usado (`tests/native/abReport.test.ts`):

| cenário | veredito exigido | resultado |
| --- | --- | --- |
| trajetórias diferentes, **mesmo** custo por draw | não acusar nada | 0 melhora, 0 piora |
| sem efeito nenhum | não acusar nada | 0 melhora, 0 piora |
| ganho injetado de 2 ms | acusar melhora | acusa |
| ganho injetado de 1 ms | acusar melhora | acusa |
| ganho injetado de 0,5 ms | acusar melhora | acusa |
| piora injetada de 1 ms | acusar piora | acusa |

**Duas correções saíram dessa validação, e as duas eram defeitos reais:**

1. **Faixas de 30 draws não controlavam a trajetória.** No cenário crítico
   (mesmo custo, caminhos diferentes) o relatório acusava "B é PIOR" — um falso
   positivo exatamente do tipo que o protocolo existe para evitar. Dentro de
   uma faixa larga, A se concentrava embaixo e B em cima, e a comparação voltava
   a comparar trajetória. **Largura corrigida para 10.**

2. **Múltiplas comparações produziam falso positivo.** Com dez faixas a 95% de
   confiança, esperam-se ~0,5 falsos positivos por comparação, e o cenário SEM
   EFEITO acusava uma faixa em "melhora". Uma faixa isolada é precisamente o que
   alguém leria como ganho. **Corrigido com Bonferroni**: a confiança por faixa
   passa a ser `1 − 0,05/N`, e o relatório imprime o valor ajustado.

### Sensibilidade

Com 4 rodadas por versão, o protocolo detecta um efeito de **0,5 ms** e não
acusa nada quando não há efeito. Abaixo disso não foi verificado — quem
precisar de mais resolução aumenta as rodadas, e deve revalidar o piso.

### Como rodar

```
yarn bench:ab -A <dir-antes> -B <dir-depois> -Rodadas 4
yarn bench:ab:report %TEMP%\ab-bench
```

As duas builds precisam ser exportadas com `--debug`, que é o que autoriza a
telemetria em arquivo.
