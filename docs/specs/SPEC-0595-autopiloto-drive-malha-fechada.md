# SPEC-0595 — autopiloto `drive` em malha fechada (condutor do jogo)

**Data:** 2026-10-25
**Status:** aceito

Item 2 de "O que falta para fechar o R1" (PRD-0466). Estende a SPEC-0414 (autopiloto de entrada) e o
kit de medição (SPEC-0382).

## Contexto

O `--autopilot drive` da SPEC-0414 não dirige. Medido em `r1-accept/drive/helio-*`: velocidade mediana
de 1,7 m/s e só 4% das amostras acima de 9 m/s. Numa sessão real do usuário com o carro, 44% das
amostras passaram de 9 m/s, e o jogo travou. Os A/B de direção nunca cobriram esse regime.

Causa, lendo o perfil (`autopilotProfiles.ts`): ele é em **malha aberta**. Acelera só 3 s e depois
esterça no batente por 4 s para cada lado, o que dá círculos em baixa velocidade e batida no que estiver
perto. Depois freia, dá ré e aperta Y duas vezes, ficando ~4,5 s fora do carro. Nada segue a rua nem
desvia. No DDD 61, o `&drive=1` ainda põe o carro no ponto de spawn com o yaw do jogador; no Setor O, ele
nasce de frente para a calçada (backlog do PRD-0009: "perfil `drive` sem desvio" e "Setor O (&drive=1)
o carro nasce de frente para a calçada").

Um perfil de passos temporizados não tem como dirigir: dirigir exige saber onde fica a rua, e quem sabe
é o jogo.

## Decisão

### Engine — passo `driver` e condutor registrado

- `AutopilotStep` ganha `driver?: true`. Nesse passo, a cada `step(dt)` o autopiloto chama o
  **condutor** registrado e escreve no controle virtual `leftX = steer`, `RT = throttle` e
  `LT = brake` (valores em 0..1, `steer` em −1..1, limitados). Os outros botões e eixos do passo
  continuam valendo.
- API pública: `setAutopilotDriver(driver: AutopilotDriver | null)`, com
  `AutopilotDriver = (dt: number) => { steer: number; throttle: number; brake: number }`. O jogo
  registra; a engine não sabe nada de ruas.
- Sem condutor registrado, um passo `driver` **solta tudo** (pad neutro) e registra uma vez em
  `debug('perf')` `[autopilot] passo driver sem condutor registrado`. A regra de validade do kit
  reprova a rodada (não anda), em vez de medir um carro parado como se fosse "dirigindo".
- Perfis embutidos: `drive` passa a ser um único passo `driver` (o condutor decide tudo).
  O antigo vira `drive-legacy`, mantido só como caso de resposta conhecida da regra abaixo.

### Jogo (DDD 61, registro próprio no `docs/specs` do jogo)

Condutor "coelho": um `Driver` do `chaseDriver.ts` (o mesmo do fugitivo e do tráfego) corre pelas ruas
na faixa da direita, na velocidade da via (`speedLimit`), com o desvio de obstáculos que o tráfego já
usa. Ele espera quando o carro do jogador fica para trás. O carro do jogador o persegue pelo controle
virtual (perseguição pura):
volante proporcional ao ângulo até o coelho, acelerador para manter a distância-alvo e freio quando o
ângulo é grande ou o coelho parou. No início, o carro é posto na faixa do coelho, alinhado ao trecho, o
que resolve o spawn de frente para a calçada. Preso (sem progresso por alguns segundos), o condutor dá
ré esterçando para o lado oposto e recoloca o coelho à frente.

### Kit — regra de validade do perfil `drive`

`trace-stats.mjs` calcula, para rodadas com autopiloto, a partir das amostras da câmera depois do
aquecimento: o **caminho percorrido** (soma dos trechos entre amostras consecutivas), a velocidade de
cada intervalo, a velocidade mediana e o % de intervalos acima de 9 m/s. Para o perfil `drive`, a
rodada é **inválida** com menos de **40%** dos intervalos acima de 9 m/s ou caminho abaixo de
**400 m** (na janela de 135 s do kit, depois dos 30 s de aquecimento). Caso de resposta conhecida: o
`drive-legacy` reprova nessa regra.

Resumo de uma linha: `native/scripts/perf/drive-stats.sh <rodada...>` (velocidade mediana, % > 9 m/s,
caminho).

## Consequências

- Os A/B de direção passam a cobrir o regime em que o usuário travou (> 9 m/s em quase metade do tempo).
- O perfil depende do jogo registrar um condutor; outro jogo sem condutor tem rodada `drive` inválida (é
  o comportamento desejado: não medir um carro parado como "dirigindo").
- O `drive-legacy` fica só como resposta conhecida; não é para medir.

## Testes

- Vitest (engine): passo `driver` escreve `leftX`/`RT`/`LT` a partir do condutor, com limites;
  sem condutor, pad neutro; `drive` é um passo `driver`; `drive-legacy` é o perfil antigo;
  `trace-stats`: caminho, velocidades e a regra do `drive` (legado reprova, rodada rápida passa).
- Jogo: Vitest do condutor (persegue o coelho, freia em curva, dá ré quando preso).
- Medição: `validate.sh` com `--autopilot drive` no Hélio e no Comercial passa a regra; o
  `drive-legacy` reprova.
