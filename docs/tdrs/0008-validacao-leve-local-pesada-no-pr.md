# 0008 - Validação leve no local, determinística no PR, aprovação pelo Greptile

**Data:** 2026-11-01
**Status:** aceito

## Contexto

Desde o TDR-0005 a `main` só recebe código por PR, com `Tests (Vitest)` e o
host nativo como checks obrigatórios do ruleset "Protecao do main" (TDR-0006),
que também exige 1 aprovação. O Greptile revisa todo PR e a regra do repo
(CLAUDE.md) só deixa mergear com Confidence Score 5/5.

Sobravam três problemas:

1. **O local fazia o trabalho do CI.** O `.husky/pre-commit` rodava a suíte
   inteira (`npx vitest run`, ~270 arquivos) a cada commit, e via `npx`,
   contra a regra do yarn. As sessões ainda rodavam `build:host` +
   `test:native` só para provar que o C++ compila, o que o job nativo do PR
   já prova.
2. **Regras do CLAUDE.md dependiam de memória do agente:** 500 linhas por
   arquivo, `package-lock.json` proibido, `console.log` cru no engine, registro
   (SPEC/ADR) antes do código. Nada disso era checado.
3. **A aprovação obrigatória travava o auto-merge.** Nenhum PR tinha quem
   aprovasse; todo merge saía pelo bypass de admin, à mão. O 5/5 do Greptile
   era conferido a olho.

O PR de docs também pagava os ~10 min do runner Windows sem mexer em código.

## Decisão

**Critério de corte:** o que é determinístico e roda num runner sem GPU vai
pro PR, por mais pesado que seja; o que depende da máquina do dev (GPU, Studio,
export nativo rodando, Blender, olho humano) fica local, por mais leve que seja.
O repo é público, então minutos de Actions não custam.

- **pre-commit** passa a rodar só `vitest related` dos arquivos staged (segundos).
  Suíte inteira, typecheck e host nativo ficam no PR.
- **PR ganha** o typecheck do engine (`tsconfig.engine.json`, limpo hoje) no job
  de testes e um job `Regras do repo` que checa o **diff** do PR (não o repo
  inteiro, que tem débito herdado): arquivo de código tocado acima de 500 linhas
  sem estar em `docs/pendencias-refatoracao.md`, `package-lock.json`,
  `console.log` adicionado em `src/`. Registro ausente vira aviso, não erro,
  porque a regra tem exceção para correção trivial.
- **Host nativo é pulado** quando o PR só toca docs/markdown. O pulo é por `if`
  no job, não por filtro de paths do workflow: job pulado conta como verde no
  check obrigatório; workflow não disparado deixa o check pendente para sempre.
- **Aprovação vem de um workflow**, disparado pelo `check_run` concluído do
  `Greptile Review`: lê o `<!-- greptile_confidence_score:N -->` que o Greptile
  grava no corpo do PR e aprova, como `github-actions[bot]`, só com 5 no commit
  que é o head. O ruleset passa a descartar aprovação a cada push.

Alternativas pesadas:

1. **GitHub App próprio que aprova.** Pedido inicial do usuário. Exige criar o
   app e a chave privada pela UI e guardar mais um segredo, e o TDR-0006 reserva o
   app atual para o release. O `GITHUB_TOKEN` já pode aprovar com a opção
   "Allow GitHub Actions to create and approve pull requests" ligada. Fica como
   plano B se a aprovação do bot deixar de contar no ruleset.
2. **Zerar a aprovação exigida.** Mais simples, mas o 5/5 continuaria só no
   papel: o auto-merge sairia com qualquer nota.
3. **Checar as regras no repo inteiro.** Reprovaria todo PR pelos 54 arquivos
   acima de 500 linhas que já existem sem registro.

## Consequências

- Commit local fica rápido; o PR passa a ser onde a suíte inteira roda. Quem
  quiser a suíte antes do push roda `yarn test` à mão.
- **Segurança da aprovação:** `check_run` sempre executa o workflow da branch
  padrão, então um PR não consegue editar o próprio gate para se aprovar. O
  workflow não faz checkout nem executa código do PR.
- O gate depende do formato do comentário do Greptile. Se ele mudar, o
  workflow não aprova (falha fechada) e o merge volta a ser manual.
- Admin segue na bypass list do ruleset; o caminho manual continua existindo.
- O `yarn typecheck` completo tem 82 erros herdados em `tests/`; por isso o CI
  checa só `src/`. Limpar os testes é pendência.
- O ddd00-game (repo privado no plano Free, sem ruleset) ganhou CI próprio
  (SPEC-0077 de lá); lá o gate de merge segue sendo a regra, não o GitHub.
- O hook do husky de toda worktree é o do checkout principal (`core.hooksPath`
  aponta para `<principal>/.husky/_`): o pre-commit novo só vale depois que a
  `main` local for atualizada.

## Backlog de pendências

- Ligar "Allow GitHub Actions to create and approve pull requests" primeiro na
  **org** (`orgs/BuuhV-Projects/actions/permissions/workflow`; no repo dá 409
  enquanto a org bloqueia) e depois no repo. Sem isso o `greptile-approve.yml`
  falha ao aprovar; fica com o dono da org.
- Validar o gate no primeiro PR depois do merge deste (o `check_run` só roda da
  `main`); se a aprovação do bot não contar no ruleset, partir para o GitHub
  App (alternativa 1).
- Zerar os 82 erros de typecheck em `tests/` e trocar o step do CI para
  `yarn typecheck` completo.
- ddd00-game: auto-merge e ruleset indisponíveis no plano Free para repo
  privado; merge segue manual após CI verde + 5/5.
