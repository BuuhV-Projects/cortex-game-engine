import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Config do harness de medição `examples/perf-kart` (SPEC-0196). Serve as cenas
 * e os assets do projeto do jogo direto do disco — o harness só LÊ; nada é
 * copiado nem alterado lá.
 *
 * Servimos por MIDDLEWARE (e não por `publicDir`) de propósito: o projeto do
 * jogo tem `main.ts`/`index.html` na raiz, que como diretório público
 * sobrescreveriam os do harness — e o `main.ts` do jogo, servido cru, quebra com
 * `SyntaxError` (não passa pelo transform do Vite).
 *
 * Sobrescreva o caminho do projeto com `PERF_KART_DIR`.
 */
const GAME_DIR = process.env['PERF_KART_DIR'] ?? 'D:/jogos/kart-racer';

/** Prefixos de URL servidos do projeto do jogo. */
const GAME_ROUTES = ['/assets/', '/scenes/'];

/** Content-Type por extensão (só o que uma cena carrega). */
const MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.json': 'application/json',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function serveGameAssets(): Plugin {
  return {
    name: 'perf-kart-game-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]!;
        if (!GAME_ROUTES.some((route) => url.startsWith(route))) return next();
        // `path.normalize` + prefixo conferido: a URL não escapa do projeto.
        const file = path.normalize(path.join(GAME_DIR, decodeURIComponent(url)));
        if (!file.startsWith(path.normalize(GAME_DIR)) || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: 'examples/perf-kart',
  publicDir: false,
  plugins: [serveGameAssets()],
});
