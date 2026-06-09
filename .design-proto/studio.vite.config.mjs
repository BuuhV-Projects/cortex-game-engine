// Harness: builda o RENDERER real (electron/renderer) como página web pura, com
// um stub de window.electronAPI, pra validar o studio via screenshot sem Electron.
import { defineConfig } from 'vite'
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'
import { resolve } from 'path'

const monacoEditorPlugin = monacoEditorPluginModule.default
const root = resolve(process.cwd(), 'electron/renderer')

// Stub clássico (roda ANTES do módulo main.ts, que é deferido) — define a API do
// preload com dados de exemplo, pra a UI montar sem o processo Electron.
const STUB_BODY = `
(function () {
  var FILES = [
    { name: 'assets', path: '/proj/assets', isDir: true },
    { name: 'components', path: '/proj/components', isDir: true },
    { name: 'entities', path: '/proj/entities', isDir: true },
    { name: 'scenes', path: '/proj/scenes', isDir: true },
    { name: 'systems', path: '/proj/systems', isDir: true },
    { name: 'main.ts', path: '/proj/main.ts', isDir: false },
    { name: 'package.json', path: '/proj/package.json', isDir: false },
    { name: 'vite.config.ts', path: '/proj/vite.config.ts', isDir: false },
  ];
  var mock = {
    prefsGet: function () { return Promise.resolve({ locale: 'pt', welcomed: true }); },
    prefsSet: function () { return Promise.resolve(); },
    menuRebuild: function () { return Promise.resolve(); },
    readDir: function () { return Promise.resolve(FILES); },
    listProjectFiles: function () { return Promise.resolve([]); },
    readFile: function () { return Promise.resolve(''); },
    readEngineTypes: function () { return Promise.resolve([]); },
    loadChatHistory: function () { return Promise.resolve([]); },
    selectDirectory: function () { return Promise.resolve(null); },
  };
  window.electronAPI = new Proxy(mock, {
    get: function (t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string' && p.indexOf('on') === 0) return function () {};
      return function () { return Promise.resolve(undefined); };
    },
  });
  try { localStorage.setItem('fileTree_projectDir', '/proj/plataform-25d'); } catch (e) {}
})();
`

export default defineConfig({
  root,
  plugins: [
    monacoEditorPlugin({
      customDistPath: (_root, buildOutDir) => resolve(buildOutDir, 'monacoeditorwork'),
    }),
    {
      name: 'electronapi-stub',
      transformIndexHtml: {
        order: 'pre',
        handler() {
          // Injeta um <script> clássico no topo do <head> — roda antes do módulo
          // main.ts (deferido), garantindo window.electronAPI definido.
          return [{ tag: 'script', children: STUB_BODY, injectTo: 'head-prepend' }]
        },
      },
    },
  ],
  build: {
    target: 'esnext',
    outDir: resolve(process.cwd(), '.design-proto/studio-dist'),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(root, 'index.html') } },
  },
})
