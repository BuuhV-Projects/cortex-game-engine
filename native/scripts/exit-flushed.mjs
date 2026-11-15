// Sai do processo depois de esvaziar stdout e stderr (SPEC-0741).
//
// O export roda no Node do Electron (ELECTRON_RUN_AS_NODE). No Windows, o
// encerramento NATURAL (loop vazio → teardown) às vezes aborta com
// "PostQueuedCompletionStatus: (6)" depois do export pronto, e o Studio lia isso
// como falha. Sair explicitamente pula esse teardown. O `write('')` com callback
// garante que as linhas já escritas no pipe saíram antes do exit.

/** Espera stdout e stderr esvaziarem e chama `process.exit(code)`. */
export function exitFlushed(code = 0) {
  let pending = 2;
  const done = () => {
    pending -= 1;
    if (pending === 0) process.exit(code);
  };
  process.stdout.write('', done);
  process.stderr.write('', done);
}
