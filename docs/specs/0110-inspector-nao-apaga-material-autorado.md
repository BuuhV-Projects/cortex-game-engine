# SPEC-0110 - Inspector não pode APAGAR o material autorado na cena

**Data:** 2026-07-13
**Status:** aceito

## Contexto

A moeda do teste4 é declarada na cena como
`material: { type: 'unlit', color: '#ffd83a', textured: false, outline: 0.02 }`
(cor chapada + contorno). No jogo ela aparecia ERRADA: unlit branco com a
textura do `.glb` e sem contorno. O usuário descobriu empiricamente que
"trocar o shader pra Padrão e voltar pra Unlit + contorno" fazia funcionar.

Diagnóstico (runtime, não olhômetro): o `data.material` do overlay tinha
`{type:'unlit', outline:0.02}` — **sem `color` e sem `textured`** — e o
`buildScene` resolve `overlay ?? nó`, então o overlay DEGRADADO vencia o
material completo declarado na cena.

Três defeitos somados:

1. **`EditorModel`: o seletor de Shader recriava a config do ZERO**
   (`{ type: 'unlit' }`), jogando fora tudo que a cena declarava. Encostar no
   dropdown — mesmo pra reescolher o MESMO preset — apagava o look autorado, e
   como o editor persiste no overlay, o estrago virava permanente.
2. **O Inspector não tinha campos de `Cor` e `Usar textura`** no unlit: o que a
   cena declarava não era nem exibido nem editável — impossível reproduzir ou
   consertar pela UI (o usuário só conseguia um "meio-termo" reaplicando).
3. **`textured` faltava no schema Zod da cena** (`SceneDefinition`): o Zod
   descartava a chave em silêncio, então cena data-driven (`level.json`, Chat
   IA) não conseguia pedir cor chapada.

## Decisão

- **Trocar de preset PRESERVA os parâmetros comuns** (`color`, `outline`,
  `outlineColor`, e `textured` no unlit) da config atual — trocar de shader
  re-sombreia, não zera a autoria.
- **Inspector do unlit ganha `Cor` e `Usar textura`**, então o material da cena
  é visível, editável e round-trip pelo overlay.
- **`textured` entra no schema** da cena.
- Testes de regressão em `tests/editor/EditorModel.test.ts` cobrem os três.

## Consequências

- Objeto que o código/`level.json` declara com material completo sobrevive a
  qualquer clique no Inspector (era o furo que corrompia a cena em silêncio).
- Overlays JÁ corrompidos continuam vencendo o nó (é o contrato do overlay):
  pra restaurar, apagar a entrada em `data.material` do `scene-data-*.json` —
  foi o que se fez com as 8 moedas do `choco-1` do teste4.
- Regra geral que fica: **autoria do editor nunca pode ser uma versão POBRE do
  que a cena declara** — ao persistir, partir do valor EFETIVO, não de um
  default vazio.
