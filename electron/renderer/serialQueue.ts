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

/** O comando esperou na fila além do prazo da ponte (quem pediu já recebeu o erro de tempo): não executa. */
export function expired(deadline: number | undefined, now: number = Date.now()): boolean {
  return deadline !== undefined && now > deadline
}
