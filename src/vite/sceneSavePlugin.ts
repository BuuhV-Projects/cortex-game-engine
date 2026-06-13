import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve, join, relative, basename, extname } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Opções do {@link createSceneSavePlugin}.
 */
export interface SceneSavePluginOptions {
  /** Caminho do arquivo gravado, relativo à raiz do projeto. Default 'assets/scene-data.json'. */
  target?: string;
  /** Endpoint do POST. Default '/__save-scene-data'. */
  endpoint?: string;
  /** Endpoint de upload de asset (importar textura do editor). Default '/__upload-asset'. */
  uploadEndpoint?: string;
  /** Pasta destino dos uploads, relativa à raiz. Default 'assets/textures'. */
  uploadDir?: string;
}

/** Extensões de imagem aceitas no upload e listadas como textura. */
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Plugin de Vite (Node-only, **dev**) que expõe endpoints do editor:
 * - POST `endpoint` (default `/__save-scene-data`): grava o `SceneFileV1` em
 *   disco. Pareia com o `HttpSceneFileWriter` do runtime.
 * - POST `uploadEndpoint` (default `/__upload-asset?name=arquivo.png`): grava o
 *   corpo binário em `uploadDir` (default `assets/textures/`) — usado pelo botão
 *   "Importar textura…" do pincel de terreno. Responde o caminho gravado.
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
  const uploadEndpoint = options.uploadEndpoint ?? '/__upload-asset';
  const uploadDir = options.uploadDir ?? 'assets/textures';

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

      server.middlewares.use(uploadEndpoint, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        // Sanitiza: só o basename (sem path traversal) e só extensões de imagem.
        const url = new URL(req.url ?? '', 'http://localhost');
        const raw = url.searchParams.get('name') ?? '';
        const name = basename(raw).replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!name || !IMAGE_EXTS.includes(extname(name).toLowerCase())) {
          res.statusCode = 400;
          res.end('Nome inválido (esperado arquivo de imagem: png/jpg/jpeg/webp)');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
          void (async () => {
            try {
              const outDir = resolve(server.config.root, uploadDir);
              await mkdir(outDir, { recursive: true });
              await writeFile(join(outDir, name), Buffer.concat(chunks));
              res.statusCode = 200;
              res.end(`${uploadDir.replace(/\\/g, '/')}/${name}`);
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
 * Plugin de Vite (Node-only, **dev**) que expõe um GET listando os assets sob
 * `assets/` (`.glb` + imagens) — o painel "Add" do editor (F2) usa os `.glb`;
 * o pincel de texturizar terreno usa as imagens. Só roda em `vite dev`; no
 * build não há editor.
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
    else {
      const ext = extname(e.name).toLowerCase();
      if (ext === '.glb' || IMAGE_EXTS.includes(ext)) out.push(relative(base, full));
    }
  }
}
