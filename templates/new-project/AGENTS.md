# Regras deste projeto

Jogo feito com a **cortex-game-engine** (motor 3D em TypeScript, arquitetura
ECS, render Three.js). Este arquivo vale para qualquer agente de IA que trabalhe
aqui.

São seis regras. Todas existem porque, quando quebradas, **o problema não dá
erro** — ele aparece depois, em outro lugar, difícil de rastrear.

## 1. Cena é dado, não código

Autore o level como JSON em `scenes/*.json` (nós `model` / `primitive` /
`light`), carregado com `buildScene(..., { world })`.

Por quê: o editor do Studio (F2) move, edita, remove e adiciona objetos, e
**salva de volta** por cima desse arquivo. Cena cravada em código não pode ser
editada pelo usuário — ele perde o controle do próprio jogo.

Lógica continua em TypeScript. Só escreva cena em código quando houver lógica
de verdade (spawn condicional, geração procedural).

## 2. Física vai nos campos do nó

Declare colisão no próprio nó da cena: `collider` (sólido), `player: true`,
`character`.

Por quê: assim ela aparece na seção **Física** do Inspector e o usuário pode
editar, trocar ou remover. Colisão adicionada só no código
(`entity.addComponent(new Collider2DComponent(...))` solto no `main.ts`) some do
Inspector — o objeto colide e ninguém consegue mudar isso pela interface.

## 3. Assente pela base, nunca por `y` chutado

Use a diretiva `place` (`{ x, y, z, rotY, scale }`): o loader assenta a **base**
do objeto em `y`.

Por quê: o pivô de cada `.glb` é arbitrário — pode estar no centro, nos pés ou
fora do modelo. Chutar `y` é o erro mais comum e mais caro: peça flutuando ou
enterrada no chão. Se precisar da medida real de um modelo, meça o `.glb` antes.

## 4. `id` de nó nunca é sequencial

Nada de `plat0`, `m1`, `m2`, contador ou índice de array. Use
`<prefixo-semântico>-<sufixo base36 de 6 chars>`: `plat-k3f9a2`, `coin-8xz1qq`.

Por quê: o overlay do editor reencontra cada objeto **só pelo id**, sem conferir
url nem tipo. Com ids de contador, inserir ou remover um nó no meio desloca
todos os seguintes — e o editor passa a aplicar a transform de um objeto em
outro, silenciosamente, com o sintoma aparecendo longe da causa.

O prefixo importa: o id é o que aparece na hierarquia do editor, e UUID cru é
ilegível.

**O id é decidido na autoria e nunca recalculado.** Se a cena for gerada por
código que roda a cada load, não chame `randomUUID()` lá dentro — o id mudaria
a cada carregamento e o overlay, que guarda o id de ontem, não casaria com nada.
Ids duplicados dão o mesmo problema: garanta unicidade.

## 5. Importe de `'cortex-game-engine'`, nunca de `'three'`

O Three.js vem embutido na engine e seus tipos são re-exportados. O pacote
`three` **não está** no `node_modules` deste projeto — importar dele quebra o
build.

Assinaturas exatas em `vendor/cortex-game-engine/index.d.ts` e nos `.d.ts` ao
lado. Se a engine não expõe algo de que você precisa, **diga isso na resposta**
em vez de reimplementar por fora sem avisar.

## 6. Não rode `build` nem `dev` aqui

Nunca execute neste projeto: `yarn build`, `yarn dev`, `npm run build`,
`npm run dev`, `npm start`, `vite`, `vite build`, `tsc -b`, `tsc -w`.

Por quê: geram `dist/` dentro do projeto e sujam a árvore e o git. Build final é
responsabilidade do Studio. Para checar compilação use `tsc --noEmit`, que não
escreve nada. `yarn install` e `yarn add` são permitidos.

## Estrutura de pastas

```
components/   só dados (classes extends Component)
systems/      só lógica (classes extends System)
entities/     factories (criam entity + components + mesh)
scenes/       setup de cena/level
assets/       .glb, texturas, sons
utils/        helpers puros
main.ts       bootstrap fino
```

Cada pasta tem um `README.md` curto — leia antes de criar arquivo novo numa que
você ainda não tocou.
