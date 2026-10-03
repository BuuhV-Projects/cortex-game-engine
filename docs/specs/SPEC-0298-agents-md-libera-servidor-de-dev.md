# SPEC-0298 - AGENTS.md do projeto libera o servidor de dev

**Data:** 2026-10-03
**Status:** aceito (substitui o item 6 da SPEC-0192)

## Contexto

A SPEC-0192 pôs no `templates/new-project/AGENTS.md` a regra 6: "Não rode
`build` nem `dev` aqui". O motivo é que esses comandos "geram `dist/` dentro do
projeto e sujam a árvore e o git". O motivo vale para o **build**, mas não para
o **dev**: o servidor do Vite serve os arquivos do disco e não escreve nada no
projeto.

O custo da proibição apareceu no Shard Hunter. O agente deixou de validar no
navegador uma mudança visual (arrasto e explosão dos slimes) porque o AGENTS.md
proibia `yarn dev`. A validação só aconteceu depois que o usuário liberou.
Sem rodar, a validação visual fica com o usuário.

## Decisão

A regra 6 do template passa a ser **"`dev` pode; `build` é do Studio"**:

- **Liberado:** `yarn dev` / `vite` (servidor de desenvolvimento) para validar o
  jogo no navegador. Ao terminar, o servidor deve ser encerrado.
- **Continua proibido:** `yarn build`, `vite build`, `tsc -b`, `tsc -w`.
  Geram `dist/`, e o build final é do Studio.
- **Continua valendo:** `tsc --noEmit` para checar compilação. `yarn install` e
  `yarn add` são permitidos.

`tests/electron/templateAgentsMd.test.ts` passa a travar os dois lados: os
comandos de build aparecem como proibidos e o servidor de dev como liberado.

## Consequências

- Projetos **novos** nascem com a regra nova. Projetos existentes mantêm o
  AGENTS.md que têm (o Shard Hunter já foi ajustado à mão).
- O Play do Studio usa a porta fixa 5174 (`strictPort`). Um servidor de dev
  esquecido pelo agente ocupa essa porta, e o Play falha até ele ser encerrado.
  Por isso a regra pede para encerrar ao terminar.
