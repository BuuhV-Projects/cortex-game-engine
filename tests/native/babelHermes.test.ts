import { describe, it, expect } from 'vitest';
import { transformAsync } from '@babel/core';
// @ts-expect-error -- plain .mjs build script, no types
import { hermesBabelOptions } from '../../native/scripts/babel-hermes.mjs';

const ROOT = process.cwd();

/** Compiles with the export's Babel options and runs it; returns what the snippet returns. */
async function run(src: string, options = hermesBabelOptions(ROOT)): Promise<unknown> {
  const out = await transformAsync(`globalThis.__babelHermesResult = (function(){${src}})();`, options);
  new Function(out!.code!)();
  return (globalThis as { __babelHermesResult?: unknown }).__babelHermesResult;
}

const SNIPPET = `
  class Base { constructor(){ this.n = 1; } get value(){ return this.n; } static get tag(){ return this.label; } m(){ return this.n * 10; } }
  class Derived extends Base {
    constructor(){ super(); this.n = 5; }
    get value(){ return super.value + 1; }
    static get tag(){ return 'd:' + super.tag; }
    m(){ return super.m() + 1; }
  }
  Base.label = 'base'; Derived.label = 'derived';
  const Anon = class extends Base { get value(){ return super.value * 2; } };
  const a = new Anon(); a.n = 7;
  const d = new Derived();
  return [d.value, Derived.tag, d.m(), a.value];
`;

describe('Babel of the native export (ADR-0465)', () => {
  it('super getter reads keep the receiver (instance, static, anonymous class); method calls still work', async () => {
    expect(await run(SNIPPET)).toEqual([6, 'd:derived', 51, 14]);
  });

  it('known answer: without the plugin the loose transform loses the receiver (the bug this guards)', async () => {
    const options = hermesBabelOptions(ROOT);
    const withoutPlugin = { ...options, plugins: options.plugins.slice(1) };
    const result = (await run(SNIPPET, withoutPlugin)) as unknown[];
    expect(result[0]).not.toBe(6);
  });

  it('a super property write fails the build instead of writing on the prototype', async () => {
    await expect(run('class A {} class B extends A { f(){ super.x = 1; } } return 0;')).rejects.toThrow(/super property write/);
  });
});
