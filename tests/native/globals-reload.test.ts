/**
 * location.reload() no shim de globals do host nativo (SPEC-0717): chama a
 * bridge __cortexRestart do host (que relança o exe depois do teardown) e só
 * existe quando a bridge existe — no console e fora do host o jogo vê um
 * location sem reload e cai no fechar.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installGlobals } from '../../native/js/src/shims/globals.js';

/** O que o installGlobals troca no global e o teste devolve depois. */
const MUTATED_GLOBALS = ['self', 'console', 'location', 'URLSearchParams', 'crypto', 'performance', '__cortexRestart', '__cortexSearch'] as const;
/** No Node são só getter; o shim atribui (`x = x || …`), então viram propriedades comuns durante o teste. */
const GETTER_GLOBALS = ['crypto', 'performance'] as const;

let saved: Map<string, PropertyDescriptor | undefined>;

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  saved = new Map(MUTATED_GLOBALS.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  delete g['__cortexRestart'];
  for (const name of GETTER_GLOBALS) {
    Object.defineProperty(globalThis, name, { value: g[name], writable: true, configurable: true, enumerable: true });
  }
});

afterEach(() => {
  for (const [name, desc] of saved) {
    if (desc) Object.defineProperty(globalThis, name, desc);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

type Loc = { reload?: () => void; search: string };
const location = (): Loc => (globalThis as unknown as { location: Loc }).location;

describe('globals: location.reload()', () => {
  it('chama __cortexRestart quando a bridge do host existe', () => {
    let restarts = 0;
    (globalThis as Record<string, unknown>)['__cortexRestart'] = (): void => {
      restarts++;
    };
    installGlobals();
    expect(typeof location().reload).toBe('function');
    location().reload!();
    expect(restarts).toBe(1);
  });

  it('não existe sem a bridge (console, bundle fora do host)', () => {
    installGlobals();
    expect(location().reload).toBeUndefined();
    expect(location().search).toBe('');
  });
});
