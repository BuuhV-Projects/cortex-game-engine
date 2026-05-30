# utils/

Helpers genéricos que não cabem em Component nem System: funções puras,
constantes, tipos auxiliares. Mantenha pequeno — quando virar lógica de
jogo, mova pra System.

## Exemplos válidos

- `random.ts` — `randomInRange(min, max)`, `pickRandom(array)`
- `math.ts` — `clamp(value, min, max)`, `lerp(a, b, t)`
- `colors.ts` — paleta de cores constantes do jogo

## Anti-padrões

- ❌ Funções que mutam o `World` ou a cena — isso é System.
- ❌ Classes com estado — vira singleton acidental.
