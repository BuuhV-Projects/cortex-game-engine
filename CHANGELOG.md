# [0.4.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.3.0...v0.4.0) (2026-05-31)


### Bug Fixes

* **chat:** destravar input ao clicar Parar sem esperar ai:done ([9af7890](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9af7890dd81344e51f3c94177f9854005b43027b))
* **installer:** copiar assets/ pro dist/ no vite build do template ([e0ea996](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e0ea9966f404e7f385290d726498755832e23be5))


### Features

* **editor:** SceneEditor — Fase 1 do ADR-0026 (edit-in-place) ([1bfe908](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1bfe9080857b34bd2dc28bd72bdcc7e83d6519ed))
* **engine:** re-exportar instancing + math/colisão do three ([51f03d5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/51f03d5ddea1d9741a588082f70437121d49b220))
* **engine:** suporte a FBX + re-exports de skeletal animation ([98a6110](https://github.com/BuuhV-Projects/cortex-game-engine/commit/98a611081bb5e5715648e5ab6f4cf590defca9ff))
* **installer:** build debug opt-in (DevTools) + fix CSP blob: pra texturas GLB ([248ec53](https://github.com/BuuhV-Projects/cortex-game-engine/commit/248ec536d96c7e344458cddfdcb189d42911f165))
* **physics:** colisão capsule via composição cylinder + 2 esferas (ADR-0027 Fase 5) ([4b20193](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4b20193465ca79a8bf7f05e7af1c7d61dcdd525a))
* **physics:** colisão cylinder + box↔cylinder + sphere↔cylinder (ADR-0027 Fase 4) ([d90d118](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d90d118f38dc86cc16be467ee8dfabc6255f6740))
* **physics:** colisão sphere e box↔sphere (ADR-0027 Fase 3) ([076a782](https://github.com/BuuhV-Projects/cortex-game-engine/commit/076a78267729cc2996206027abe1c7a6fa677fd7))
* **physics:** ColliderComponent ganha shape discriminado (ADR-0027 Fase 1) ([8b7725c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8b7725c94f9171c25520de0531cde63fcffc4629))


### Reverts

* **editor:** remover SceneEditor — descartar ADR-0026 Fase 1 ([7d877be](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7d877be54f8ae6caa8c0d1c8dbc144b02a8b7099))

# [0.3.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.2.0...v0.3.0) (2026-05-30)


### Features

* **ide:** i18n EN/PT com welcome modal, menu Language e modo release ([d3db13e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d3db13e897fc5093e4cef55f6cded8980e8cd6db))
* **installer:** splash screen do jogo com logo Cortex real ([0dfcf97](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0dfcf971f22a8ab7fe8c95ed8ab31794d4096b93))
* **web:** i18n EN/PT na landing e na documentação ([f5b5552](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f5b5552b163ac18e9d34819d8d58a11557f80375))

# [0.2.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.1.2...v0.2.0) (2026-05-30)


### Features

* **security:** hardening em runtime da IDE e do jogo Tauri ([9963069](https://github.com/BuuhV-Projects/cortex-game-engine/commit/996306915334b6c94557df2294120fb4708b143e))

## [0.1.2](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.1.1...v0.1.2) (2026-05-30)


### Bug Fixes

* **ci:** usar REPO_ACCESS_TOKEN || github.token + injetar GH_TOKEN no electron-builder ([ebfa68a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ebfa68aede8aaa30f7a0d74cf50848a23fb32354))

## [0.1.1](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.1.0...v0.1.1) (2026-05-30)


### Bug Fixes

* **installer:** WebGL no WebView2 + canvas com dimensões válidas ([3129407](https://github.com/BuuhV-Projects/cortex-game-engine/commit/3129407b472747c776bd1538a796a5b91aafa2d7))

# 0.1.0 (2026-05-30)


### Bug Fixes

* **blender:** detectar export silenciosamente falhado + alertar sobre Boolean.solver ([fa8270e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/fa8270e8b6788c2ba3c73caa22bda5795e0d52b1))
* **blender:** simplificar params do export_scene.gltf no system prompt ([cec90c1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/cec90c16787a2f7bc76be644413478addb78119e))
* **chat-ia:** ajustar autenticacao OAuth e formatar erro 429 ([ac17350](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ac17350ce97dff15b3a18f6aab835e8534dfa5ab))
* **chat-ia:** corrigir abertura da janela PowerShell no Windows ([5dc4e0e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5dc4e0e0a19f5754afeb8dd9656c09f7a0c1be9f))
* **chat-ia:** corrigir spawn do claude login no Windows ([33ec9b8](https://github.com/BuuhV-Projects/cortex-game-engine/commit/33ec9b8622ae77239353c151d83b992b2b9d49ef))
* **chat-ia:** resolver claude bin via require.resolve ([5556106](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5556106231c295e8b2fba4c8887857acd66afa3f))
* **chat-ia:** usar powershell em vez de cmd no Windows ([ee135e7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ee135e7afd8a37940080e8abbe8acd414cf2fcd0))
* **chat:** adiar dispatch do project-open restaurado para próximo microtask ([2f571c0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2f571c0cf4aa3d4659d6ac8edd0c7cf80c9bbaca))
* **chat:** destravar input após Limpar histórico ([64cc780](https://github.com/BuuhV-Projects/cortex-game-engine/commit/64cc780bb436347eff45f255de219347c3ab2e3a))
* **chat:** forçar input habilitado após Limpar mesmo sem histórico ([f1cd971](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f1cd971c9de4e47c446e1caa17362b63c4415656))
* **chat:** garantir que o agente só toque no projeto ativo ([b437187](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b4371874ed46cb6bc9436a54493f64f4029fe659))
* **config:** restaurar descoberta de testes em tests/ no vitest ([161cb52](https://github.com/BuuhV-Projects/cortex-game-engine/commit/161cb5274fc03d42d0daedf9cc4086a12d4122ca))
* **editor:** Ctrl+click em imports do projeto + middle-click fecha aba ([dc1d90f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/dc1d90f77df257f7f020c2ed7877c31f941a860d))
* **electron:** alinhar caminhos de saída com diretório out/ ([d7690a7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d7690a712c118025c72214670e7ada169d0e21a2))
* **electron:** impedir path traversal no handler fs:writeFile ([484b55c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/484b55c6224b48a85ab1f05e17448a1767c847bd))
* **electron:** matar árvore de processos no Stop (Windows) ([de00ec0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/de00ec0f1c266d1f88aecfdeab7cfd755b0d59c0))
* **electron:** permitir salvar em qualquer path (não só userData/projects) ([f5c3b1f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f5c3b1f4b02abb6b2bb5172bb1770e94c015e0a4))
* **ide:** botão "Abrir Projeto" usar diálogo nativo do SO ([32e449e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/32e449e0f409c80ce5e860b77445b4ce5f169782))
* **ide:** strippar ANSI no console + bloquear terminal durante Play ([580b34e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/580b34e78c93fb9f740d9f6f8fe47e6ebcbfef1f))
* **tooling:** postinstall força download do Electron com --use-system-ca ([05350b5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/05350b5e3c372662b0ebd76e2c2cc5c52385d0c2))
* **types:** consolidar tipos do renderer + tsconfig próprio ([4b9a36a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4b9a36af36997d968b06a05dc853b6a726a451b3))


### Features

* adicionar ponto de entrada público com re-exports do motor ([2551ac4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2551ac4dcb16ab97db11ed2cb5e5c0e822a07d38))
* **agent:** direcionar IA a usar cortex-game-engine, não three direto ([f6f8f8d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f6f8f8df564d89006b013f749072d9d923c6de31))
* **agent:** expor generate_blender_model como tool MCP no chat ([2570bb9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2570bb9bed9bf85184a3693436ab869ee03cbf56))
* **agent:** proibir comandos de build/dev no Bash do chat IA ([c6306ba](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c6306ba1061acfe308a0ba7b499d08464d8f1c26))
* **ai:** implementar ScriptGenerator e BlenderModelGenerator via Claude API ([2767b6c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2767b6c15d6761314228ff6c54f10a4528a64f8e))
* **blender:** usar claude-agent-sdk no BlenderModelGenerator ([de9defd](https://github.com/BuuhV-Projects/cortex-game-engine/commit/de9defd5b0807271a218b997faaa2d4e3f83ee8a))
* **chat-ia:** banner de auth sempre visivel com botao trocar conta ([791667b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/791667ba9f7238383863870d1c2600f82848f64d))
* **chat-ia:** botao de login no Claude direto pelo chat ([aa40161](https://github.com/BuuhV-Projects/cortex-game-engine/commit/aa401611e921062fed1026b266f2b9f85ccf350f))
* **chat-ia:** migrar agente para @anthropic-ai/claude-agent-sdk ([7d3a3fe](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7d3a3fe493a337af156a9382a830978616c7ee4e))
* **chat-ia:** permitir minimizar a sidebar do chat ([988c174](https://github.com/BuuhV-Projects/cortex-game-engine/commit/988c174e3f6727063b9cda227b969bdbebcaf028))
* **chat-ia:** transformar chat em agente com tool use ([cfef7dd](https://github.com/BuuhV-Projects/cortex-game-engine/commit/cfef7ddc23b368de7e2b3b80a7ea8cee1a27a583))
* **chat:** apagar imagens de paste após o turno do agente terminar ([0074739](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0074739fc00a657b5436c9ceb21807bfd4c7a003))
* **chat:** chips visuais para imagens coladas (estilo Claude) ([229f5d7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/229f5d7d6b1f46935606e77970f4daaccc9e73d6))
* **chat:** indicador 'Pensando...' entre envio e primeira resposta ([22c99a2](https://github.com/BuuhV-Projects/cortex-game-engine/commit/22c99a2730f6eac30f4f392eaa338b23a5722500))
* **chat:** modos Ask/Auto para aprovação de tools ([ef8bc45](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ef8bc452a252b08a8ce37527707f735534ec05d4))
* **chat:** mostrar tempo e custo do turno após cada resposta ([053d819](https://github.com/BuuhV-Projects/cortex-game-engine/commit/053d819eafa0c7de80eb6d9c5dcbed11590118c4))
* **chat:** paste de imagem (Ctrl+V) no chat IA ([28e799e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/28e799e559598da719fdf2f832a328c4327354c4))
* **chat:** persistir histórico por projeto em userData/chats/ ([9cda378](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9cda37818a4edf4ec146e07814ac37dbb7a9fe7a))
* **chat:** renderizar markdown nas respostas do assistente ([e35e80b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e35e80b0aba17eee31681e438875563694ed935a))
* **cli:** adicionar CLI jsgame-ai com comandos generate-script e generate-model ([c6cb6a2](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c6cb6a2567fe32d4a856fb03b4afb57b77fda92a))
* **core:** implementa AudioManager com THREE.AudioListener ([a423ef3](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a423ef3c6e6007270186f51dfff47b78606ee51c))
* **core:** implementar AssetLoader com cache para texturas, GLTF e áudio ([0bf9050](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0bf905070ba8f864ababbec86e0351ea06db028d))
* **core:** implementar GameLoop com rAF, setInterval e passo fixo ([dd5da56](https://github.com/BuuhV-Projects/cortex-game-engine/commit/dd5da561e7b198aa5de13afd22f5dce5e6e0e431))
* **core:** implementar Scene como wrapper fino de THREE.Scene ([82c802a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/82c802afc162b589cf08fe93712a2e3eb9551564))
* **demo:** demo ECS com cubo rotacionando e câmera WASD (T017) ([8e2d746](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8e2d746799a035be25162cb6373240f006aaea7f))
* **editor:** dirty state nas abas + read-only para arquivos do engine ([3fad405](https://github.com/BuuhV-Projects/cortex-game-engine/commit/3fad4057d179fe643248cd3cb22986a16ae72a53))
* **editor:** implementar Monaco com abertura e salvamento de arquivos ([51628a1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/51628a11ce8c8a083aac26a2bda413687dd3a67b))
* **electron:** adicionar FileTree.ts e completar estrutura do renderer ([60694fb](https://github.com/BuuhV-Projects/cortex-game-engine/commit/60694fbe054f6db6ed11113c747e6259c40baf51))
* **electron:** configurar electron-builder e campo main do package.json ([194e588](https://github.com/BuuhV-Projects/cortex-game-engine/commit/194e5883628a5a3772820e0679ba03080770e8b6))
* **electron:** seletor de pasta nativo via dialog do SO ([5402af5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5402af53f44e0a7cec3db5e5bf95120b310d4614))
* **engine:** empacotar engine como bundle ESM autocontido ([e73c005](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e73c00553f18260a56b6af777497fc9612c7ec35))
* **engine:** re-exports de three + template com cubo girando ([94571de](https://github.com/BuuhV-Projects/cortex-game-engine/commit/94571de2ba631b1eba642b9141f6714287e809c7))
* **engine:** suporte nativo a split-screen e gamepad ([bcbc5e5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/bcbc5e5f0e56ad9e38ff4f42786e78023ec3c476))
* **filetree:** botão refresh manual na toolbar + log de debug do auto-refresh ([e26880d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e26880d5b6327614e2e7bd86c155b17dbd60231e))
* **filetree:** recarregar árvore após tool do agente mexer no FS ([d573a3f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d573a3f5d760a27b95d3bb931fe85d394e7eecd6))
* **filetree:** sidebar estilo Cursor — header + ícones + file-icons ([5695c64](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5695c64cce61d4a0718e313bcd5049c9568f914b))
* **ide:** aplicar tema Atom One Dark em todo o IDE ([ab0a3fc](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ab0a3fc1f16d5f3a6b381444b6005d1a356b75c7))
* **ide:** botão de criar arquivo na sidebar ([255a089](https://github.com/BuuhV-Projects/cortex-game-engine/commit/255a0898165b7b6333f5b0a7728506e052536971))
* **ide:** chat IA, resize, criar pasta + fixes IPC e ANSI ([a6c5387](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a6c5387005822ec81324c2cc646faa6038c09254))
* **ide:** painél Preview com Play/Stop e console de saída ([ca4dd44](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ca4dd44bb27bdffadb0c92a4dcad47db0b911ed3))
* **ide:** paste centralizado em userData + retomar sessão entre execuções ([5b3d4bf](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5b3d4bff8c9de4eee45c2f2c227ff5cdcaa6e21e))
* **ide:** prompt custom + context menu + drag/drop no FileTree, auth Claude Code ([166a7d6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/166a7d633cefcc9ccab90792a683a104d2eadb2e))
* **ide:** resize vertical preview/bottom-panel + fix terminal travado ([93aa8c7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/93aa8c7d7b5d1262be1bb526ece643ce047f50d5))
* **ide:** terminal embutido + painel inferior com abas Console/Terminal ([55e2fca](https://github.com/BuuhV-Projects/cortex-game-engine/commit/55e2fcaaca6161c65fbccb05645c28cd2f3eed51))
* **ide:** vendoriza engine em projetos + IntelliSense + abas no editor ([0329893](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0329893271a428a03e8ec1118fd43165d6d206d0))
* **ide:** yarn install automático após criar projeto ([bd4aff7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/bd4aff73df6745b0e1422428fbd376c298c4c015))
* **installer:** empacotar jogo como .exe Windows via Tauri 2 ([e8e0553](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e8e05531c127327e9bff636d1fbaadf11b22b945))
* **installer:** jogo final em fullscreen sem decorações + sem UI de WebView ([b584eae](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b584eae0320b92a6885aa7f3090b4d1c5eba959d))
* **physics:** implementar PhysicsSystem AABB com impulso elástico ponderado por massa ([a7ec897](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a7ec8977733961d6e42c153e8ee236faa9a6eb42))
* **preview:** botão fullscreen do preview dentro da janela do IDE ([813e7fb](https://github.com/BuuhV-Projects/cortex-game-engine/commit/813e7fb79d8d65d2eb48e8495bf555650b2233bc))
* **renderer:** adicionar ProjectManager para criar novos projetos ([a872045](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a872045875390c7e4a821fbcbc1e386d742ff0fa))
* **template+agent:** padrão arquitetural ECS — pastas, READMEs e regras ([872ddb5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/872ddb54a68232d9b16bc6aa17b6b738dc73c02d))
* **templates:** adicionar scaffold de novo projeto e substituição de placeholder ([53ddf2c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/53ddf2cd1b6e5fdbf4916a9d39509e39616b5d26))
* **web:** landing + visualizador de docs em Vite + Tailwind v4 ([44fd3ae](https://github.com/BuuhV-Projects/cortex-game-engine/commit/44fd3aebcc58d6cab16fb0aad1bf1492ca7697e1))


### Reverts

* **chat-ia:** remover botao de login, voltar a usar so env/credenciais do SO ([1f79fe5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1f79fe5be9096c632398769b1e84c79e8d8570d7))
