# 0223 - Piloto externo no `VehicleControlSystem`

**Data:** 2026-09-20
**Status:** aceito

## Contexto

O `VehicleControlSystem` tem duas posições possíveis, e só duas:

- `active()` **verdadeiro** — lê teclado/controle e escreve motor, freio e
  esterço a cada substep;
- `active()` **falso** — **estaciona o carro**: `setEngineForce(0)` e
  `setBrake(maxBrake)`.

Não existe a terceira, que é "não leia entrada nenhuma, mas também não
interfira — outro código está dirigindo". Quem tenta dirigir um carro por
código bate numa das duas paredes: com `active()` verdadeiro o controlador
sobrescreve as forças no substep seguinte; com falso, o freio de mão vence.

Isso apareceu no `kart-racer`: o modo benchmark (SPEC-0007 do jogo) precisa que
a IA pilote o carro do jogador, para que a medição percorra o mapa sozinha, sem
entrada sintética. O `driveAI` do jogo já calcula motor, freio e esterço — só
não tinha como entregá-los.

O mesmo buraco aparece em modo atrator (demo rodando no menu), replay e
cinemática com carro.

## Decisão

Uma opção nova, `autopilot`, que só tem efeito quando `active()` é falso:

```ts
} else if (!(o.autopilot?.() ?? false)) {
  this.vehicle.setEngineForce(0);
  this.vehicle.setBrake(o.maxBrake ?? 50);
}
```

Com ela ligada o controlador **não escreve nada** no veículo: quem definiu
motor, freio e esterço antes continua valendo. Tudo o mais segue igual —
`vehicle.update`, `keepUpright`, `physics.step`, sincronização da malha, das
rodas e da câmera. O mundo avança exatamente uma vez por chamada, como sempre.

É um predicado (`() => boolean`), não um booleano, pelo mesmo motivo de
`active` e `pauseWhen`: o estado muda em runtime e o jogo não reconstrói o
controlador para isso.

## Consequências

- Sem `autopilot`, nada muda: o default é `false` e o caminho é o de hoje.
- Ligar `autopilot` **sem** ninguém escrevendo as forças deixa o carro em ponto
  morto — sem motor e sem freio, rolando livre. É responsabilidade de quem liga.
- **A câmera segue o carro em autopilot.** A perseguição (`placeCamera`) passa
  a rodar com `driving` **ou** `autopilot` — sem isso a câmera congela onde
  estava e o carro sai de quadro, que foi o primeiro resultado da medição no
  `kart-racer`. O que não roda em autopilot é a **leitura de entrada**,
  inclusive a de olhar: a câmera persegue, mas ninguém a gira.
