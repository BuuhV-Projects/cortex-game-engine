/**
 * Fila de um por vez (SPEC-0746): os comandos da ponte chegam em paralelo, mas o painel executa um de cada vez, na
 * ordem de chegada (um `setGrip` não muda a pegada no meio de um `save`). A falha de um não trava os seguintes.
 */
export function serialQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job)
    tail = run.catch(() => undefined)
    return run
  }
}
