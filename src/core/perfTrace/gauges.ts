/**
 * Medidores do jogo lidos a cada amostra do trace (`game.<name>`, SPEC-0595). Saíram do `PerfTrace.ts` para ele caber
 * em 500 linhas (SPEC-0690). Módulo interno: a assinatura pública continua sendo o `setPerfTraceGauge` do PerfTrace.
 */
const gauges = new Map<string, () => number>();

/** Registra o medidor `name`, ou o remove com `null`. */
export function setGauge(name: string, read: (() => number) | null): void {
  if (read === null) gauges.delete(name);
  else gauges.set(name, read);
}

/** O valor de cada medidor agora; `undefined` sem nenhum registrado. */
export function readGauges(): Record<string, number> | undefined {
  if (gauges.size === 0) return undefined;
  const out: Record<string, number> = {};
  gauges.forEach((read, name) => {
    out[name] = read();
  });
  return out;
}
