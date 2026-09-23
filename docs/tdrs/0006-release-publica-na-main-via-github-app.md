# 0006 - Release publica na `main` via GitHub App próprio (não `GITHUB_TOKEN`)

**Data:** 2026-09-22
**Status:** aceito

## Contexto

O TDR-0005 fechou o gate de PR: a `main` passou a exigir pull request com 1
review e dois status checks obrigatórios (`Tests (Vitest)` e
`Host nativo (Windows) + cortex_host_tests`). A proteção configurada é a
*branch protection* clássica do GitHub, com `restrictions` limitando o push
direto a dois usuários (`buuhvprojects`, `bruno-buuhvprojects`, ambos admin) e
`enforce_admins` desligado.

Isso quebrou o `release.yml`. O job `Decide release` roda `semantic-release`
com o plugin `@semantic-release/git`, que **commita** `CHANGELOG.md` +
`package.json` e dá `git push ... HEAD:main` depois do merge. O push passou a
ser recusado com os três motivos acumulados:

```
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - 2 of 2 required status checks are expected.
remote: - You're not authorized to push to this branch.
```

O ator do push é o `github-actions[bot]`: o workflow usa
`secrets.REPO_ACCESS_TOKEN || github.token` e o secret `REPO_ACCESS_TOKEN`
nunca foi cadastrado, então o fallback `GITHUB_TOKEN` é quem empurra. Ele não
está em `restrictions`, não está em `bypass_pull_request_allowances`, e — o
ponto que fecha a porta — **não existe forma de dar bypass a ele**:

- Na branch protection clássica, `required_status_checks` só é ignorado por
  admin (com `enforce_admins` off). Não há bypass por app.
- Em *ruleset* de repositório, o GitHub recusa o app na bypass list com
  `Actor GitHub Actions integration must be part of the ruleset source or
  owner organization`. O "GitHub Actions" é um app implícito, não uma
  instalação da org — as instalações de `BuuhV-Projects` são apenas
  `terraform-cloud`, `lovable-dev` e `cursor`.

Alternativas pesadas:

1. **PAT de admin no `REPO_ACCESS_TOKEN`.** Funciona de imediato e sem mexer
   em nada (admin + `enforce_admins` off passa por tudo). Mas amarra a
   pipeline à conta de uma pessoa, com escopo `repo` inteiro (todos os repos
   da conta) e validade que expira — a release volta a quebrar sozinha no dia
   em que o token vencer.
2. **Remover o `@semantic-release/git`.** Sem commit na `main`, só tag +
   GitHub Release (criadas por API, que não passa pela proteção). Não exige
   privilégio nenhum, mas o job `build` faz checkout da tag: sem o commit de
   bump, a tag aponta para o `package.json` com a versão **anterior** e os
   instaladores sairiam numerados errado. Consertável injetando a versão no
   build, ao custo de perder o `CHANGELOG.md` versionado no repo.
3. **GitHub App próprio da organização.**

## Decisão

Adotada a alternativa 3: um **GitHub App da org `BuuhV-Projects`**, dedicado à
CI, é quem publica a release.

- O app é instalado na org com acesso ao `cortex-game-engine` e permissões de
  repositório mínimas para o que o `semantic-release` faz: *Contents*
  read & write (commit do CHANGELOG, tag), *Pull requests* e *Issues*
  read & write (comentários do `@semantic-release/github`), *Metadata* read.
- `App ID` e chave privada ficam em secrets do repositório
  (`CORTEX_CI_APP_ID`, `CORTEX_CI_APP_PRIVATE_KEY`).
- O job `Decide release` gera um token de instalação com
  `actions/create-github-app-token@v2` e o usa tanto no `checkout`
  (`persist-credentials`) quanto como `GITHUB_TOKEN` do `semantic-release`.
- A proteção da `main` migra de branch protection clássica para **ruleset**,
  com as mesmas regras (PR + 1 review, os dois status checks em modo estrito,
  resolução de conversas, sem deleção) e o app na **bypass list**. Admin de
  repositório continua na bypass list, preservando o `enforce_admins: false`
  de hoje.

A precedência `secrets.REPO_ACCESS_TOKEN || github.token` do `release.yml` é
substituída pelo token do app; o `REPO_ACCESS_TOKEN` deixa de ser consultado.

## Consequências

- **A credencial deixa de ser pessoal.** O escopo é o repositório, não a conta
  inteira, e o token de instalação é efêmero (gerado por execução, expira em
  1h). Não há renovação manual periódica como num PAT.
- **A release volta a disparar workflows downstream.** Assim como um PAT — e
  ao contrário do `GITHUB_TOKEN` — a tag criada pelo app acorda triggers de
  push. Isso é o comportamento que o comentário original do `release.yml` já
  desejava.
- **Ruleset em vez de branch protection clássica.** As duas coexistem e a mais
  restritiva vence, então a clássica é removida na mesma mudança. Quem for
  mexer na proteção da `main` daqui pra frente edita o ruleset, não a aba de
  branches.
- **Custo de setup não automatizável.** Criar o app e gerar a chave privada
  são passos de UI do GitHub; só o ruleset e o workflow são reproduzíveis por
  API. Se o app for removido da org, a release quebra com o mesmo erro GH006.
- **A bypass list é o novo ponto sensível.** Um token do app tem poder de
  push direto na `main`. O app é de uso exclusivo da release; não deve ser
  reaproveitado como credencial genérica de automação.
