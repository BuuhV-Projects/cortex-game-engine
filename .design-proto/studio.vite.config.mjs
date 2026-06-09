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

  // Simula a ponte do editor (ADR-0056): posta um 'state' de exemplo pra o
  // EditorPanels popular hierarquia + inspector sem o jogo rodando.
  setTimeout(function () {
    var vec = function (id, label, v) { return { kind: 'vec3', id: id, label: label, value: v }; };
    var msg = {
      source: 'cortex-editor', type: 'state', editorActive: false,
      outliner: { items: [
        { id: 'o0', label: '__editor_collider_gizmos', type: 'Group', selected: false },
        { id: 'o1', label: 'Camera', type: 'PerspectiveCamera', selected: false },
        { id: 'o2', label: '(CameraHelper)', type: 'CameraHelper', selected: false },
        { id: 'o3', label: '(HemisphereLight)', type: 'HemisphereLight', selected: false },
        { id: 'o4', label: '(AmbientLight)', type: 'AmbientLight', selected: false },
        { id: 'o5', label: '(DirectionalLight)', type: 'DirectionalLight', selected: false },
        { id: 'o6', label: 'safety_net', type: 'Mesh', selected: false },
        { id: 'o7', label: 'ground_start', type: 'Mesh', selected: true },
        { id: 'o8', label: 'ground_start_dirt', type: 'Mesh', selected: false },
        { id: 'o9', label: 'tree_start', type: 'Mesh', selected: false },
        { id: 'o10', label: 'bush_start', type: 'Mesh', selected: false },
        { id: 'o11', label: 'coin_1', type: 'Mesh', selected: false },
      ] },
      inspector: { title: 'ground_start', empty: false, sections: [
        { fields: [ vec('p:pos', 'Posição', [12, 0, 4.5]), vec('p:rot', 'Rotação (°)', [0, 0, 0]), vec('p:scl', 'Escala', [1, 1, 1]) ] },
        { title: 'Sombra', fields: [
          { kind: 'checkbox', id: 'p:cast', label: 'Projeta sombra', value: true },
          { kind: 'checkbox', id: 'p:recv', label: 'Recebe sombra', value: true },
        ] },
        { title: 'Material', fields: [ { kind: 'checkbox', id: 'p:matte', label: 'Fosco (matte)', value: false } ] },
        { title: 'Collider', fields: [
          { kind: 'select', id: 'p:shape', label: 'Forma', value: 'box', options: [
            { value: 'box', label: 'Caixa' }, { value: 'circle', label: 'Círculo' }, { value: 'capsule', label: 'Cápsula' } ] },
          { kind: 'number', id: 'p:w', label: 'Largura', value: 10, step: 0.1 },
          { kind: 'number', id: 'p:h', label: 'Altura', value: 2, step: 0.1 },
          { kind: 'checkbox', id: 'p:solid', label: 'Sólido', value: true },
          { kind: 'button', id: 'p:rm', label: 'Remover collider', variant: 'danger' },
        ] },
      ] },
    };
    window.postMessage(msg, '*');
  }, 1800);
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
