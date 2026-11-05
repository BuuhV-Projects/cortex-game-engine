/**
 * Plugin de hot reload (SPEC-0697 §1): injeção do self-accept nos scripts,
 * cliente de modelo no index.html e filtro do `hotUpdate`. Os hooks são
 * chamados direto (com o `root` resolvido pelo `configResolved`) e, no fim, num
 * servidor vite real em `middlewareMode`, para confirmar que o alias do engine
 * resolve no código injetado e no módulo `html-proxy`.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { createHotReloadPlugin } from '../../src/vite/hotReloadPlugin.js';

const ROOT = 'D:/jogo';
/** Timeout do servidor real (pre-bundle e transform no 1º uso). */
const SERVER_TIMEOUT_MS = 30_000;

type HookFn = (this: unknown, ...args: unknown[]) => unknown;
function hook(plugin: Plugin, name: 'transform' | 'hotUpdate' | 'configResolved' | 'transformIndexHtml'): HookFn {
  const h = plugin[name] as unknown;
  return (typeof h === 'function' ? h : (h as { handler: HookFn }).handler) as HookFn;
}

function pluginAt(root = ROOT, options = {}, publicDir = `${ROOT}/public`): Plugin {
  const plugin = createHotReloadPlugin(options);
  hook(plugin, 'configResolved').call(undefined, { root, publicDir });
  return plugin;
}

function transform(plugin: Plugin, id: string, code = 'export class A {}'): string | null {
  const out = hook(plugin, 'transform').call({}, code, id) as { code: string } | null;
  return out?.code ?? null;
}

function hotUpdate(plugin: Plugin, file: string, type = 'update', envName = 'client') {
  const send = vi.fn();
  const result = hook(plugin, 'hotUpdate').call(
    { environment: { name: envName, hot: { send } } },
    { file, type, modules: [] },
  );
  return { result, send };
}

describe('transform (scripts)', () => {
  it('acrescenta o accept com o caminho relativo e o import do engine', () => {
    const code = transform(pluginAt(), `${ROOT}/scripts/Girar.ts`)!;
    expect(code.startsWith('export class A {}')).toBe(true);
    expect(code).toContain(`import { hotReplaceScripts as __cortexHotReplaceScripts } from "cortex-game-engine";`);
    expect(code).toContain('__cortexHotReplaceScripts("scripts/Girar.ts", m)');
    expect(code).toContain('import.meta.hot.invalidate(');
  });

  it('normaliza caminho do Windows (\\ e drive minúsculo) e tira a query', () => {
    const code = transform(pluginAt('d:\\jogo'), 'D:\\jogo\\scripts\\sub\\B.js?t=123')!;
    expect(code).toContain('"scripts/sub/B.js"');
  });

  it('ignora .d.ts, teste, outra extensão, fora de scripts/ e fora da raiz', () => {
    const plugin = pluginAt();
    for (const id of [
      `${ROOT}/scripts/tipos.d.ts`,
      `${ROOT}/scripts/Girar.test.ts`,
      `${ROOT}/scripts/Girar.spec.js`,
      `${ROOT}/scripts/dados.json`,
      `${ROOT}/systems/X.ts`,
      `${ROOT}/scriptsX/Y.ts`,
      'D:/outro/scripts/A.ts',
    ]) {
      expect(transform(plugin, id), id).toBeNull();
    }
  });

  it('não duplica quando o arquivo já tem import.meta.hot.accept', () => {
    expect(transform(pluginAt(), `${ROOT}/scripts/A.ts`, 'import.meta.hot.accept()')).toBeNull();
  });

  it('membro #privado nativo → sem accept (reload completo); # em string/.#x não conta', () => {
    const plugin = pluginAt();
    const id = `${ROOT}/scripts/Girar.ts`;
    expect(transform(plugin, id, 'export class G {\n  #t = 0;\n  u() { return this.#t; }\n}')).toBeNull();
    expect(transform(plugin, id, 'export class G { c = "#fff"; d = `#${1}`; }')).not.toBeNull();
  });

  it('respeita scriptsDir e engineImport', () => {
    const plugin = pluginAt(ROOT, { scriptsDir: './comportamentos/', engineImport: './vendor/e.js' });
    const code = transform(plugin, `${ROOT}/comportamentos/A.ts`)!;
    expect(code).toContain('from "./vendor/e.js"');
    expect(transform(plugin, `${ROOT}/scripts/A.ts`)).toBeNull();
  });
});

describe('transformIndexHtml', () => {
  it('injeta no <head> o cliente de modelo, em ordem pre', () => {
    const plugin = createHotReloadPlugin();
    expect((plugin.transformIndexHtml as { order: string }).order).toBe('pre');
    const [tag] = hook(plugin, 'transformIndexHtml').call(undefined) as Array<Record<string, unknown>>;
    expect(tag).toMatchObject({ tag: 'script', attrs: { type: 'module' }, injectTo: 'head' });
    expect(tag.children).toContain('enableModelHotReload();');
    expect(tag.children).toContain(`import.meta.hot.on('cortex:model-changed'`);
  });
});

describe('hotUpdate', () => {
  it('GLB/glTF sob a raiz → evento com a URL relativa e []', () => {
    const plugin = pluginAt();
    const glb = hotUpdate(plugin, 'D:\\jogo\\assets\\carro.glb');
    expect(glb.result).toEqual([]);
    expect(glb.send).toHaveBeenCalledWith('cortex:model-changed', { url: 'assets/carro.glb' });
    expect(hotUpdate(plugin, `${ROOT}/x.GLTF`).send).toHaveBeenCalledWith('cortex:model-changed', { url: 'x.GLTF' });
  });

  it('.claude/ e node_modules/ → [] sem evento; fora da raiz segue o fluxo normal', () => {
    const plugin = pluginAt();
    for (const file of [`${ROOT}/.claude/worktrees/w/main.ts`, `${ROOT}/node_modules/three/index.js`]) {
      const { result, send } = hotUpdate(plugin, file);
      expect(result, file).toEqual([]);
      expect(send).not.toHaveBeenCalled();
    }
    // Pacote irmão por alias: o HMR dele não pode ser engolido.
    const outside = hotUpdate(plugin, 'D:/outro/src/lib.ts');
    expect(outside.result).toBeUndefined();
    expect(hotUpdate(plugin, 'D:/outro/assets/carro.glb').send).not.toHaveBeenCalled();
  });

  it('GLB do publicDir manda a URL servida (sem o prefixo do publicDir), inclusive fora da raiz', () => {
    expect(hotUpdate(pluginAt(), `${ROOT}/public/models/x.glb`).send).toHaveBeenCalledWith('cortex:model-changed', { url: 'models/x.glb' });
    const outside = hotUpdate(pluginAt(ROOT, {}, 'D:/estaticos'), 'D:/estaticos/carro.glb');
    expect(outside.send).toHaveBeenCalledWith('cortex:model-changed', { url: 'carro.glb' });
    // publicDir desligado (false → ''): o caminho segue relativo à raiz
    expect(hotUpdate(pluginAt(ROOT, {}, ''), `${ROOT}/public/x.glb`).send).toHaveBeenCalledWith('cortex:model-changed', { url: 'public/x.glb' });
  });

  it('o resto segue o fluxo normal; GLB apagado não manda evento', () => {
    const plugin = pluginAt();
    expect(hotUpdate(plugin, `${ROOT}/scripts/A.ts`).result).toBeUndefined();
    const deleted = hotUpdate(plugin, `${ROOT}/assets/carro.glb`, 'delete');
    expect(deleted.result).toEqual([]);
    expect(deleted.send).not.toHaveBeenCalled();
  });

  it('só age no ambiente client', () => {
    const { result, send } = hotUpdate(pluginAt(), `${ROOT}/assets/carro.glb`, 'update', 'ssr');
    expect(result).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('servidor vite real (middlewareMode)', () => {
  let dir: string;
  let server: ViteDevServer;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cortex-hot-'));
    mkdirSync(join(dir, 'scripts'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'scripts', 'A.ts'), 'export class A { n: number = 1 }\n');
    writeFileSync(join(dir, 'assets', 'x.glb'), '');
    writeFileSync(
      join(dir, 'engine.js'),
      'export const hotReplaceScripts = () => true;\nexport const enableModelHotReload = () => {};\nexport const hotReloadModel = () => {};\n',
    );
    server = await createServer({
      root: dir,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
      resolve: { alias: { 'cortex-game-engine': join(dir, 'engine.js') } },
      plugins: [createHotReloadPlugin()],
    });
  }, SERVER_TIMEOUT_MS);

  afterAll(async () => {
    await server?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('script vira self-accepting e o import do engine resolve pelo alias', async () => {
    const out = await server.environments.client.transformRequest('/scripts/A.ts');
    expect(out!.code).toContain('__cortexHotReplaceScripts("scripts/A.ts", m)');
    expect(out!.code).toContain('/engine.js');
    expect(out!.code).not.toContain('from "cortex-game-engine"');
    const mod = await server.environments.client.moduleGraph.getModuleByUrl('/scripts/A.ts');
    expect(mod!.isSelfAccepting).toBe(true);
  }, SERVER_TIMEOUT_MS);

  it('cliente do index.html vira módulo html-proxy com import.meta.hot e alias resolvido', async () => {
    writeFileSync(join(dir, 'index.html'), '<html><head></head><body></body></html>');
    const html = await server.transformIndexHtml('/index.html', '<html><head></head><body></body></html>');
    const src = /<script type="module" src="([^"]*html-proxy[^"]*)"/.exec(html)?.[1];
    expect(src).toBeDefined();
    const out = await server.environments.client.transformRequest(src!);
    expect(out!.code).toContain('import.meta.hot = __vite__createHotContext(');
    expect(out!.code).toContain('/engine.js');
  }, SERVER_TIMEOUT_MS);

  it('hotUpdate de GLB no ambiente client real manda o evento', async () => {
    const client = server.environments.client;
    const send = vi.spyOn(client.hot, 'send');
    const plugin = server.config.plugins.find((p) => p.name === 'cortex-hot-reload')!;
    const result = await hook(plugin, 'hotUpdate').call(
      { environment: client },
      { file: join(dir, 'assets', 'x.glb'), type: 'update', modules: [] },
    );
    expect(result).toEqual([]);
    expect(send).toHaveBeenCalledWith('cortex:model-changed', { url: 'assets/x.glb' });
  });
});
