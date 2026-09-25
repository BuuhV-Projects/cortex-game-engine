# SPEC-0273 — Argumentos do `codex exec resume`

**Data:** 2026-09-25
**Status:** aceito
**Corrige:** SPEC-0192 / SPEC-0267 (retomada da sessão do Astra)

## Contexto

Todo turno que retoma a sessão do Astra falhava antes de começar:

```
error: unexpected argument '--sandbox' found
Usage: codex exec resume --model <MODEL> <SESSION_ID> [PROMPT]
```

O runner montava a retomada como um turno novo com `resume <id>` no meio:
`exec resume <id> --model … --sandbox … --skip-git-repo-check -C <raiz> --json -`.
No Codex CLI 0.154.0, o subcomando `resume` aceita `--model`,
`--skip-git-repo-check`, `--json` e `-c`, mas **não** `--sandbox` nem `-C`.

Caso visto: o portão reprovou `oceano.glb`, devolveu para correção (tentativa 2)
e o turno morreu com esse erro. O mesmo quebra o primeiro turno do Modelagem
depois de reabrir o Studio (sessão salva) e a segunda delegação do Orquestrador.

## Decisão

Turno novo (sem sessão):

```
exec --model <M> --sandbox <S> --skip-git-repo-check -C <raiz> --json -
```

Retomada:

```
exec resume --model <M> -c sandbox_mode="<S>" --skip-git-repo-check --json <id> -
```

- O sandbox da retomada vai como configuração (`-c sandbox_mode=…`), a chave
  do `config.toml` que o `--sandbox` também define.
- A pasta vem do `cwd` do processo, que já é a raiz do projeto.

Verificado com o CLI real: a retomada manteve o mesmo `thread_id`, lembrou do
turno anterior e escreveu um arquivo com `workspace-write`.

## Consequências

- Teste em `tests/electron/codexArgs.test.ts`: turno novo e retomada, nos três
  modos, sem `--sandbox`/`-C` depois de `resume`.
- Se uma versão futura do CLI mudar as opções do `resume`, o erro volta a
  aparecer no chat como agora (mensagem do próprio CLI).
