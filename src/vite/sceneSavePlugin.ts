import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve, join, relative } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Opções do {@link createSceneSavePlugin}.
 */
export interface SceneSavePluginOptions {
  /** Caminho do arquivo gravado, relativo à raiz do projeto. Default 'assets/scene-data.json'. */
  target?: string;
  /** Endpoint do POST. Default '/__save-scene-data'. */
  endpoint?: string;
}

/**
 * Plugin de Vite (Node-only, **dev**) que expõe um endpoint POST para gravar o
 * `SceneFileV1` em disco. Pareia com o `HttpSceneFileWriter` do runtime.
 *
 * Importe num `vite.config` (em projetos vendoriados, do caminho copiado, ex.:
 * `./vendor/cortex-game-engine/vite/sceneSavePlugin.js`):
 *
 * @example
 * import { createSceneSavePlugin } from './vendor/cortex-game-engine/vite/sceneSavePlugin.js'
 * export default defineConfig({ plugins: [createSceneSavePlugin()] })
 */
export function createSceneSavePlugin(options: SceneSavePluginOptions = {}): Plugin {
  const target = options.target ?? 'assets/scene-data.json';
  const endpoint = options.endpoint ?? '/__save-scene-data';

  return {
    name: 'cortex-scene-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(endpoint, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          void (async () => {
            try {
              const outPath = resolve(server.config.root, target);
              await mkdir(dirname(outPath), { recursive: true });
              await writeFile(outPath, body, 'utf-8');
              res.statusCode = 200;
              res.end('ok');
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
            }
          })();
        });
      });
    },
  };
}

/**
 * Plugin de Vite (Node-only, **dev**) que expõe um GET listando os `.glb` sob
 * `assets/` — usado pelo painel "Add" do editor (F2) pra você adicionar um asset
 * à cena. Só roda em `vite dev`; no build não há editor.
 *
 * @example
 * import { createAssetListPlugin } from './vendor/cortex-game-engine/vite/sceneSavePlugin.js'
 * export default defineConfig({ plugins: [createAssetListPlugin()] })
 */
export function createAssetListPlugin(options: { dir?: string; endpoint?: string } = {}): Plugin {
  const dir = options.dir ?? 'assets';
  const endpoint = options.endpoint ?? '/__list-assets';

  return {
    name: 'cortex-asset-list',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(endpoint, (req, res) => {
        void (async () => {
          try {
            const root = resolve(server.config.root, dir);
            const found: string[] = [];
            await walk(root, root, found);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(found.map((p) => `${dir}/${p.replace(/\\/g, '/')}`)));
          } catch {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end('[]'); // sem pasta de assets → lista vazia
          }
        })();
      });
    },
  };
}

async function walk(base: string, current: string, out: string[]): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  for (const e of entries) {
    const full = join(current, e.name);
    if (e.isDirectory()) await walk(base, full, out);
    else if (e.name.toLowerCase().endsWith('.glb')) out.push(relative(base, full));
  }
}
