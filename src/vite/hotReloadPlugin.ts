import type { Plugin } from 'vite';

/**
 * Opções do {@link createHotReloadPlugin}.
 */
export interface HotReloadPluginOptions {
  /** Pasta dos scripts de comportamento, relativa à raiz. Default 'scripts'. */
  scriptsDir?: string;
  /** Especificador do engine nos imports injetados. Default 'cortex-game-engine'. */
  engineImport?: string;
}

/** Evento custom que o servidor manda quando um GLB/glTF muda (SPEC-0697). */
const MODEL_CHANGED_EVENT = 'cortex:model-changed';
/** Extensões de modelo trocadas sem reload (fatia 1 do ADR-0696). */
const MODEL_EXT_RE = /\.(glb|gltf)$/i;
/** Script: `.ts`/`.js`, fora `.d.ts` e arquivos de teste. */
const SCRIPT_EXT_RE = /\.(ts|js)$/;
const SCRIPT_SKIP_RE = /\.d\.ts$|\.(test|spec)\.[^/]*$/;
/**
 * Declaração de membro `#privado` nativo (fora de `.#x`, string e template). O nome
 * privado nasce a cada avaliação da classe: a instância viva trocada de protótipo não o
 * teria, e todo acesso lançaria. Módulo assim fica sem `accept` → reload completo.
 */
const PRIVATE_MEMBER_RE = /(^|[^\w$.'"`])#[A-Za-z_$][\w$]*/;
/** Pastas cujas mudanças o watcher vê mas o jogo não usa (worktrees aninhadas, deps). */
const IGNORED_SEGMENTS = new Set(['.claude', 'node_modules']);

/** `\` → `/` e letra de drive maiúscula: compara caminho do Windows com o `config.root`. */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`);
}

/** Caminho relativo à raiz (com `/`), ou `null` se estiver fora dela. */
function relativeToRoot(root: string, file: string): string | null {
  const path = normalizePath(file);
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : null;
}

/**
 * Plugin de Vite (Node-only, **dev**) que gera as fronteiras de hot reload do
 * engine (ADR-0696, SPEC-0697). O jogo não escreve `import.meta.hot`:
 * - **script** (`<scriptsDir>/**.ts|js`): o módulo vira self-accepting e o
 *   `accept` chama `hotReplaceScripts`, que troca a classe das instâncias vivas
 *   preservando o estado. Exportou algo que não é `ScriptBehavior` →
 *   `invalidate()` e reload completo, como antes. Módulo com `#privado` nativo não
 *   ganha o `accept` (reload completo);
 * - **GLB/glTF** sob a raiz: manda `cortex:model-changed { url }` e o cliente
 *   injetado no `index.html` chama `hotReloadModel(url)`, que troca os filhos
 *   das raízes vivas;
 * - mudança sob `.claude/` ou `node_modules/` é descartada (corta o
 *   reload causado por edição em outra worktree).
 *
 * Autocontido (só tipos do `vite`), pois é copiado arquivo a arquivo para
 * `vendor/cortex-game-engine/vite/`.
 *
 * @example
 * import { createHotReloadPlugin } from './vendor/cortex-game-engine/vite/hotReloadPlugin.js'
 * export default defineConfig({ plugins: [createHotReloadPlugin()] })
 */
export function createHotReloadPlugin(options: HotReloadPluginOptions = {}): Plugin {
  const scriptsDir = (options.scriptsDir ?? 'scripts').replace(/\\/g, '/').replace(/^\.?\/|\/$/g, '');
  const engineImport = JSON.stringify(options.engineImport ?? 'cortex-game-engine');
  let root = '';

  return {
    name: 'cortex-hot-reload',
    apply: 'serve',
    configResolved(config) {
      root = normalizePath(config.root).replace(/\/$/, '');
    },
    transform(code, id) {
      const rel = relativeToRoot(root, id.split('?')[0]);
      if (rel === null || !rel.startsWith(`${scriptsDir}/`)) return null;
      if (!SCRIPT_EXT_RE.test(rel) || SCRIPT_SKIP_RE.test(rel)) return null;
      // O autor já escreveu a própria fronteira: não duplica.
      if (code.includes('import.meta.hot.accept')) return null;
      if (PRIVATE_MEMBER_RE.test(code)) return null;
      const footer = [
        `import { hotReplaceScripts as __cortexHotReplaceScripts } from ${engineImport};`,
        'if (import.meta.hot) import.meta.hot.accept((m) => {',
        `  if (!m || !__cortexHotReplaceScripts(${JSON.stringify(rel)}, m)) import.meta.hot.invalidate('cortex: módulo de script exporta algo que não é ScriptBehavior');`,
        '});',
      ].join('\n');
      // Só acrescenta no fim: as linhas de cima não mudam, o sourcemap vale.
      return { code: `${code}\n${footer}\n`, map: null };
    },
    transformIndexHtml: {
      // 'pre': a tag entra antes do hook do vite que transforma script inline em
      // módulo `html-proxy` — só assim o import do engine resolve pelo alias e o
      // `import.meta.hot` existe. Fica no <head>, antes do main.ts: o registro de
      // raízes já está ligado quando o buildScene monta a cena.
      order: 'pre',
      handler() {
        return [
          {
            tag: 'script',
            attrs: { type: 'module' },
            children: [
              `import { enableModelHotReload, hotReloadModel } from ${engineImport};`,
              'enableModelHotReload();',
              `if (import.meta.hot) import.meta.hot.on('${MODEL_CHANGED_EVENT}', ({ url }) => hotReloadModel(url));`,
            ].join('\n'),
            injectTo: 'head',
          },
        ];
      },
    },
    hotUpdate({ file, type }) {
      if (this.environment.name !== 'client') return;
      const rel = relativeToRoot(root, file);
      // Fora da raiz (pacote irmão por alias): fluxo normal do vite, sem engolir o HMR.
      if (rel === null) return;
      if (rel.split('/').some((segment) => IGNORED_SEGMENTS.has(segment))) return [];
      if (!MODEL_EXT_RE.test(rel)) return;
      // Apagado: não há o que recarregar; o jogo segue com o modelo em memória.
      if (type !== 'delete') this.environment.hot.send(MODEL_CHANGED_EVENT, { url: rel });
      return [];
    },
  };
}
