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
    // Gera um spritesheet de exemplo (strip horizontal de 6 frames 64×64) pra
    // validar o preview de imagem e o player de spritesheet 2D sem fs real.
    readFileBase64: function () {
      var c = document.createElement('canvas'); c.width = 384; c.height = 64;
      var x = c.getContext('2d');
      for (var i = 0; i < 6; i++) {
        x.fillStyle = 'hsl(' + (i * 52) + ',68%,55%)';
        x.fillRect(i * 64, 6, 64, 52);
        x.fillStyle = '#fff'; x.font = 'bold 26px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(String(i + 1), i * 64 + 32, 32);
      }
      return Promise.resolve(c.toDataURL('image/png').split(',')[1]);
    },
    readEngineTypes: function () { return Promise.resolve([]); },
    loadChatHistory: function () { return Promise.resolve([
      { role: 'user', content: 'quando eu apago o numero 0 e deixo o input de rotacao vazio, ele apaga o player da cena' },
      { role: 'assistant', content: 'Reproduzi o bug. O atalho Backspace vira deletar objeto quando o input perde foco vazio. Agora existe o Inspector pra digitar direto no campo sem o blur capturar a tecla.' },
    ]); },
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
    var node = function (id, label, type, sel, kids) { return { id: id, label: label, type: type, selected: !!sel, children: kids || [] }; };
    var msg = {
      source: 'cortex-editor', type: 'state', editorActive: false,
      outliner: { items: [
        node('o0', '__editor_collider_gizmos', 'Group', false),
        node('o1', 'Camera', 'PerspectiveCamera', false, [ node('o2', '(CameraHelper)', 'CameraHelper', false) ]),
        node('o3', '(HemisphereLight)', 'HemisphereLight', false),
        node('o4', '(AmbientLight)', 'AmbientLight', false),
        node('o5', '(DirectionalLight)', 'DirectionalLight', false),
        node('o6', 'safety_net', 'Mesh', false),
        node('o7', 'ground_start', 'Mesh', true, [ node('o8', 'ground_start_dirt', 'Mesh', false) ]),
        node('o9', 'tree_start', 'Mesh', false),
        node('o10', 'bush_start', 'Mesh', false),
        node('o11', 'coin_1', 'Mesh', false),
      ] },
      inspector: { title: 'ground_start', empty: false, sections: [
        { fields: [ vec('p:pos', 'Posição', [12, 0, 4.5]), vec('p:rot', 'Rotação (°)', [0, 0, 0]), vec('p:scl', 'Escala', [1, 1, 1]) ] },
        { title: 'Sombra', fields: [
          { kind: 'checkbox', id: 'p:cast', label: 'Projeta sombra', value: true },
          { kind: 'checkbox', id: 'p:recv', label: 'Recebe sombra', value: true },
        ] },
        { title: 'Material', fields: [ { kind: 'checkbox', id: 'p:matte', label: 'Fosco (matte)', value: false } ] },
        { title: 'Shader', fields: [
          { kind: 'select', id: 'p:shader', label: 'Shader', value: 'unlit', options: [ {value:'standard',label:'Padrão (PBR)'}, {value:'unlit',label:'Unlit (fullbright)'}, {value:'toon',label:'Toon (cel)'} ] },
          { kind: 'checkbox', id: 'p:matTwoSided', label: 'Dois lados', value: false },
          { kind: 'checkbox', id: 'p:matTransp', label: 'Transparente', value: false },
        ] },
        { title: 'Collider', fields: [
          { kind: 'select', id: 'p:shape', label: 'Forma', value: 'box', options: [
            { value: 'box', label: 'Caixa' }, { value: 'circle', label: 'Círculo' }, { value: 'capsule', label: 'Cápsula' } ] },
          { kind: 'number', id: 'p:w', label: 'Largura', value: 10, step: 0.1 },
          { kind: 'number', id: 'p:h', label: 'Altura', value: 2, step: 0.1 },
          { kind: 'checkbox', id: 'p:solid', label: 'Sólido', value: true },
          { kind: 'button', id: 'p:rm', label: 'Remover collider', variant: 'danger' },
        ] },
        { title: 'Animação', fields: [
          { kind: 'select', id: 'p:animClip', label: 'Clipe', value: 'Idle', options: [ {value:'Idle',label:'Idle'}, {value:'Walk',label:'Walk'}, {value:'Run',label:'Run'} ] },
          { kind: 'button', id: 'p:animPlay', label: '▶ Tocar' },
          { kind: 'button', id: 'p:animStop', label: '⏹ Parar' },
          { kind: 'checkbox', id: 'p:animLoop', label: 'Loop', value: true },
          { kind: 'number', id: 'p:animSpeed', label: 'Velocidade', value: 1, step: 0.1 },
        ] },
        { title: 'Ações do player', fields: (function(){
          var acts = [['idle','Idle'],['walk','Walk'],['run','Run'],['jump','Jump'],['fall','Jump_Idle'],['land','Jump_Land']];
          var clips = ['Idle','Walk','Run','Jump','Jump_Idle','Jump_Land'].map(function(c){return {value:c,label:c}});
          var fs = [ { kind:'button', id:'p:paAuto', label:'🔎 Auto-mapear pelos nomes' } ];
          acts.forEach(function(a){
            fs.push({ kind:'select', id:'p:pa:'+a[0], label:a[0], value:a[1], options:clips });
            fs.push({ kind:'button', id:'p:paPlay:'+a[0], label:'▶ '+a[0] });
          });
          fs.push({ kind:'button', id:'p:paStop', label:'⏹ Parar preview' });
          return fs;
        })() },
      ] },
      viewport: { camera: 'cam: 10.7, 15.7, 12.7  yaw: 45°  pitch: -35°', fps: 60, objects: 18, lights: 2, selected: 'ground_start', gizmo: 'translate' },
    };
    window.postMessage(msg, '*');
  }, 1800);

  // (validação do inspector da cena — glb desligado; reative pra testar o preview 3D)
  // setTimeout(function () {
  //   document.dispatchEvent(new CustomEvent('file-open', { detail: { path: '/proj/assets/Bouncer.glb', name: 'Bouncer.glb' } }));
  //   document.dispatchEvent(new CustomEvent('glb-asset', { detail: { name: 'Bouncer.glb', sizeBytes: 1258291, meshes: 1, materials: 1, animations: 16, triangles: 1248 } }));
  // }, 2600);

  // (validação do player de spritesheet 2D — abre o .png e clica em "Spritesheet")
  // setTimeout(function () {
  //   document.dispatchEvent(new CustomEvent('file-open', { detail: { path: '/proj/assets/hero_run.png', name: 'hero_run.png' } }));
  //   setTimeout(function () { var b = document.querySelector('.sprite-toggle-btn'); if (b) b.click(); }, 500);
  // }, 2600);
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
