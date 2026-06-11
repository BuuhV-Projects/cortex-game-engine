# [0.24.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.23.0...v0.24.0) (2026-06-11)


### Bug Fixes

* **editor:** pincel de terreno não esculpia — gizmo roubava o clique ([d8be974](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d8be974c80625d33ae1d54687914f029ef49688a))
* **editor:** pincel de terreno respeita escala + anel de pincel (estilo Unity) ([ad180d7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ad180d7c4a485d9613f96cea24ce90762fc71bd5))
* **editor:** terreno do editor vira sólido na hora + maior/mais resolução ([decac9c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/decac9cb2766378fa3c7eef9dc554ed2e5a569b3))
* **ide:** botão do inspector com label dinâmico não atualizava (Esculpir⇄Parar) ([cf0a37a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/cf0a37a63f56bc4bc9513b4fef15900e3bb2232f))
* **ide:** mata vite preso na porta do projeto (Play/stop/quit) ([cc33441](https://github.com/BuuhV-Projects/cortex-game-engine/commit/cc33441ee249cdf4fd2471d649a3411893f433ab))


### Features

* **editor:** ferramenta de esculpir terreno — pincel raise/lower (ADR-0059 T2) ([bfd4c09](https://github.com/BuuhV-Projects/cortex-game-engine/commit/bfd4c098998d2dda9ea304d445aed2b46886b370))
* **editor:** tipo de corpo "Character" no Inspector + física editável (não no código) ([e05ed36](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e05ed36983d595524cde109ce6579a9f557b207f))
* **engine:** CharacterBodyComponent — character controller estilo UPBGE ([db120ba](https://github.com/BuuhV-Projects/cortex-game-engine/commit/db120ba3a6b559aafe886ed1d92f0a67f048c9e2))
* **engine:** CharacterGroundSystem — personagem fica em cima de qualquer mesh ([8a8bb97](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8a8bb97281a7bd244604015808700310f0e9b700))
* **engine:** terreno heightmap esculpível — Terrain + nó data-driven (ADR-0059 T1) ([f6f6057](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f6f6057b612abeb31f22658cc94745b4662eafaa))
* **engine:** terreno sólido por padrão — colisão por heightmap (ADR-0059 T3) ([f6a152c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f6a152ccfcfdd0d163057ca3a76c1921376f04e4))
* **ide:** DevTools do studio no menu View (só em dev) ([ab90c81](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ab90c811716bee2ae186af0397c36a005161379f))
* **ide:** menu Cena → "Adicionar terreno" cria um terreno na cena ([9b2df7c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9b2df7cac287f3cd9a4cba562f069ccc657b0c20))
* **ide:** opção "Re-vendorizar engine" no menu Projeto ([500bb49](https://github.com/BuuhV-Projects/cortex-game-engine/commit/500bb4964821c968af0a5f18fb626f9495ecdca9))

# [0.23.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.22.1...v0.23.0) (2026-06-10)


### Bug Fixes

* **ide:** Play roda o vite LOCAL do projeto (corrige "Cannot find package vite") ([9578c83](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9578c8361de576ac86a16c01666eee9b50e8f589))


### Features

* **engine:** TopDownCameraSystem — câmera vista de cima (jogos de fazenda/RPG 2D) ([369950c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/369950cf020bdcb858457d2d095a448c7a7efe7b))
* **ide:** git init + commit inicial ao criar projeto (template = 1ª versão) ([7439de9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7439de99f49b8126cfc74d9275f9d3164e67e0e4))
* **ide:** sidebar Projeto atualiza em tempo real (fs.watch) preservando expansão ([baa5306](https://github.com/BuuhV-Projects/cortex-game-engine/commit/baa53066fdc9716b1fb72edbdcd4cf10fbeb959d))

## [0.22.1](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.22.0...v0.22.1) (2026-06-10)


### Bug Fixes

* **editor:** rotação editada se perdia ao recarregar (TransformComponent sem rotationY) ([22a7217](https://github.com/BuuhV-Projects/cortex-game-engine/commit/22a7217c06219b8d211be86bf8ba52c283ebc5b8))

# [0.22.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.21.0...v0.22.0) (2026-06-10)


### Bug Fixes

* **editor:** shader — objeto sumia ao mexer no contorno + cor real + dropdown legível ([c09688b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c09688b11657dc5bd66ce8147b510c55d86ca05a))
* **electron:** tsconfig do electron é type-check puro (corrige TS6059 no blender.ts) ([b3d3927](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b3d3927378c5e9cc57933fa935e7872739cb7d7a))
* **engine:** material re-sombreia em cima do original sem achatar cores (toon/unlit) ([e25a64d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e25a64daf3be44f3f757a06d2ab21b0ae55a47fe))
* **engine:** objeto some no editor por frustum culling errado (esfera obsoleta/animado) ([3bd438c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/3bd438ca7bba0dc2216fb3537d7b45ba8f5e0243))
* **input:** tecla não trava ao soltar com Shift (câmera do editor andava pra sempre) ([9136571](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9136571873465a13591d05fe7d7c57f16c394227))


### Features

* **editor:** seção Shader no inspector — escolhe material por objeto (ADR-0058 S3) ([5c4b7a8](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5c4b7a8fc3892abe562059f27c4071023f5e5817))
* **engine:** framedata 2D no kit.json — nó sprite herda grade/animações do kit ([d54a08e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d54a08e5a7c564f601f51c35af7d6e6f81a3be35))
* **engine:** nó sprite 2D data-driven na cena (ADR-0057) ([a9114ab](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a9114abc59ef865eee7b55642de362b4d3ced032))
* **engine:** sistema de material/shader por objeto — preset unlit (ADR-0058) ([430acc0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/430acc0b7cbe353760d91414a30e331b6558d7ef))
* **ia:** import_kit traz só os assets usados (list_kit_assets + nudge) ([8039a9d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8039a9daf2ae9ccf70abd1992cee163e30702b74))
* **ide:** preview/player de spritesheet 2D (rota A) ([26eaf66](https://github.com/BuuhV-Projects/cortex-game-engine/commit/26eaf667c79705e220b2c98264dfbff657df3fd5))
* **skill:** process-asset-kit-2d — pack de sprites 2D → kit do engine (sem Blender) ([f630d0e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f630d0efe35b938c74d5269f2a629afb879f50da))

# [0.21.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.20.0...v0.21.0) (2026-06-09)


### Bug Fixes

* **editor:** editar transform pelo inspector escreve no ECS (rotação não revertia) ([ff0a3a1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ff0a3a143ba9545826281a481f7a18a44be00c3b))
* **editor:** F (focar) em objeto sem geometria foca na posição, não na origem ([70b7fbb](https://github.com/BuuhV-Projects/cortex-game-engine/commit/70b7fbbab4f6894b08b5934b3fd58dd31c7e9aae))
* **editor:** helpers de luz/câmera não roubam o clique nem tampam a cena ([dbe9858](https://github.com/BuuhV-Projects/cortex-game-engine/commit/dbe985898895785480077fda7a2d9d3cc84b607a))
* **engine:** FollowCamera2D pausa no editor (não briga com a câmera no edit) ([f5aea8d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f5aea8d69dfeb3792511387acea00b9e6a0fd0f9))
* **ide:** inspector de animação/ações do player menos poluído ([88ba1ba](https://github.com/BuuhV-Projects/cortex-game-engine/commit/88ba1ba766b8665cfd3ee3f3d1183751b558daf3))
* **ide:** remove o botão + do dock esquerdo (sem função) ([5b15a42](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5b15a424dff37936ca5f8e45af751b9e3784c426))
* **ide:** scroll da hierarquia, busca da aba Projeto e limpeza da toolbar ([fb40dd8](https://github.com/BuuhV-Projects/cortex-game-engine/commit/fb40dd8603e64a5526e67b471e0f38398f5ce439))


### Features

* **editor:** câmera desacelera perto de superfícies + hierarquia colapsada por padrão ([597322a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/597322adbdf4d55c0c435b9a6a8f1af2d1669f32))
* **editor:** câmera livre mais lenta + tecla 0 vê pela câmera do jogo ([be39084](https://github.com/BuuhV-Projects/cortex-game-engine/commit/be3908409ddf486723ee33c2f929b5f6bb972ee2))
* **ide:** casca do redesign — menubar + toolbar + janela frameless (Layout A) ([4c61e2b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4c61e2bce25c6cdbc8d5cf9c4833bedd333cf5c8))
* **ide:** doc-tabs (Cena + arquivos) + ajustes do preview GLB ([eb5b43b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/eb5b43bca68912539172dd8a5e0daad5dacef0ba))
* **ide:** docks do Layout A — hierarquia/projeto à esq, inspector à dir ([75274e5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/75274e555166e679b096559bb129d42e87e2c0e1))
* **ide:** fundação do redesign — tema cortex-dark + fontes + design-system ([7dd351c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7dd351ce815227295c4f445cfdcae0bd62d20b07))
* **ide:** preview 3D (GLB) redesenhado + Asset inspector + dock contextual ([8e649a6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8e649a6fffd86e8dae8ccbc09b30013fa2557ca1))
* **ide:** reskin do inspector/hierarquia pro Layout A (ADR-0056) ([5698dae](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5698dae4c54f2c7be51aa4a5db6300048faab4fa))
* **ide:** transport controla a gameplay (Unity-style) + pause no engine ([fa129a6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/fa129a67fb81d9063ffa5cceb81e49b88c4be4c7))
* **ide:** viewport limpo — HUD vira pills flutuantes (Layout A 100%) ([a28046d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a28046d808ed05d56776ddc0d7966963b29acfae))

# [0.20.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.19.0...v0.20.0) (2026-06-08)


### Features

* **editor:** painéis da IDE como chrome via ponte postMessage (ADR-0056) ([89b589f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/89b589ff24887af51f45883d36cd168176bcb6c6))

# [0.19.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.18.0...v0.19.0) (2026-06-08)


### Bug Fixes

* **editor:** atalhos não disparam ao digitar no inspector (Backspace deletava o objeto) ([dcb8049](https://github.com/BuuhV-Projects/cortex-game-engine/commit/dcb8049d7c10f815b4839e12be013c9a73949c98))
* **editor:** só Delete apaga objeto, não Backspace (robustez do bug do inspector) ([00640dd](https://github.com/BuuhV-Projects/cortex-game-engine/commit/00640dd7d93bb843baaa4c751242acfd94df20f8))


### Features

* **editor:** ▶ por ação no 'Ações do player' (preview de cada animação) ([0dd500c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0dd500ca185509c7cc89604e03cdbde175e6a733))
* **editor:** rotação livre no modo 2.5D (girar o player/objetos) ([ef6aac6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ef6aac62bad274f3cb5e6ad3a0571f92024aaf1f))
* **editor:** seção 'Ações do player' no inspector (mapa ação→clipe, slice 2) ([f3e6ff0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f3e6ff0e45d9637a5c9e0ed499b8f514bb3f09c9))
* **engine:** Logic Bricks — fundação (schema + runtime), slice 1 do ADR-0055 ([62a171b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/62a171bd0893ff281e7e1346557a3af84e0e16fa))
* **engine:** state machine de animação do player (slice 1) ([36efc5a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/36efc5a9fcb9557e276f57c75f42e52ac4352624))
* **ide:** prompt ensina animação do player por ação (slice 3) ([22a5424](https://github.com/BuuhV-Projects/cortex-game-engine/commit/22a54246c2daf11ae9ca60ca015fb47d0b3c99bc))

# [0.18.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.17.0...v0.18.0) (2026-06-08)


### Bug Fixes

* **editor:** painéis opacos + z-index máximo (HUD do jogo não sobrepõe) ([5860e43](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5860e438409f66f98efca36e6a012566a7c44188))
* **ide:** mata o vite/terminal ao fechar o Studio (before-quit) ([4a771fa](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4a771fa9f726d42803d80beafb5daf87e73c2660))


### Features

* **editor:** câmera do jogo visível no editor (hierarquia + frustum) ([a64f222](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a64f22295a4a4984a748cba3ab9b351ef9066408))
* **editor:** helpers visuais de luz no editor (direção/cone/esfera, estilo Blender) ([d8e1bf4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d8e1bf419c8b80575fca3a9e6d60f5f2dc65160f))
* **editor:** seção Animação no inspector (escolher clipe + play/stop + loop/velocidade) ([6251a1b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/6251a1b28b3c913203b26cd79df2d3e23f2ffdc2)), closes [#4](https://github.com/BuuhV-Projects/cortex-game-engine/issues/4)
* **engine:** animação data-driven de modelos (SceneAnimator + nó animation) ([6fc02b8](https://github.com/BuuhV-Projects/cortex-game-engine/commit/6fc02b8e6b963fc0f29f2ba982c6c48c3a0d4d53))

# [0.17.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.16.0...v0.17.0) (2026-06-08)


### Features

* **ide:** 'Fechar projeto' no menu Projeto; menu some na tela inicial ([e7f944e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e7f944ee6949a44f1ec9aa7204ddaeb462d2ec52))
* **ide:** fechar projeto → volta pra tela inicial (recentes/abrir) ([6a58b02](https://github.com/BuuhV-Projects/cortex-game-engine/commit/6a58b021f9c5bfd72c729688020a209c56b86eb8))

# [0.16.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.15.0...v0.16.0) (2026-06-08)


### Bug Fixes

* **ide:** Chat IA não usa mais AskUserQuestion (perguntava sem dar opção) ([9ce850c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9ce850ce0347d9638b632fb9099c154cbf82a9c2))
* **ide:** import_kit põe thumbnails em .cortex (fora do build do jogo) ([181c142](https://github.com/BuuhV-Projects/cortex-game-engine/commit/181c1429eeb689fd6fe384d699223dad0b970fea))
* **ide:** vendorizar os tipos de scene/Kit (módulo novo do ADR-0053) ([23df02a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/23df02a6802108777f4edaf675391cc7bf4d418f))


### Features

* **editor:** persistir o toggle Fosco (matte) no overlay (autorar de vez) ([e2036fb](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e2036fbc32d7e5d502b13f070c9e730310178344))
* **editor:** toggle Fosco (matte) no inspector — liga/desliga por objeto ([35742f0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/35742f02fc43ced0503f2edb04dde115ec85c9e5))
* **engine:** backdrop 2D com parallax (Background + nó background) ([1964e87](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1964e87ca3ac892ef34eae79665d91915b3c9034))
* **engine:** roles character/enemy no kit (KIT_ROLES) + classify KayKit/Quaternius ([2b4cc84](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2b4cc8429aac73f889bfb7f6c6278f0ff89548a2))
* **engine:** setMatte — look fosco/cartoon (mata o brilho PBR dos .glb) ([61d1ab5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/61d1ab59b30d9b161bcfd60d06eb69dc944f812f))
* **ide:** botão Fechar nos previews de glb e imagem/markdown ([6b45ad6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/6b45ad632cdb45cb9bf573b5953dfb0f491d4f1a))
* **ide:** kits de assets dentro do engine + tools list_kits/import_kit (ADR-0053) ([b7354a5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b7354a50cb0d0b33a9745d1988337fdf2e0e3f91))
* **ide:** preview 3D de .glb/.gltf com lista de animações + playback ([7f4de73](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7f4de734097e1cd88c89a401e9b956f235b08c50))
* **ide:** splash com logo + tela inicial (criar/abrir jogo + recentes) ([e80e6ed](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e80e6ed697288950bc3cb1fe7a7863754c641028))
* **skill+ide:** catalogar backdrops 2D (kit role background) + IA usa background node ([dd1642e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/dd1642ee10e40692bf6bc5bccc4da25008acebef))
* **template:** look fosco (matte) por padrão + hints de câmera iso/pitch ([c2f8dd8](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c2f8dd8004fe58e5a200089175232213b85bb621))

# [0.15.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.14.0...v0.15.0) (2026-06-08)


### Features

* **engine:** câmera isométrica no 2.5D (yaw + preset isometric) ([93902c6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/93902c6af8d88c2f6655977d6be8d805b759c99e))
* **engine:** kit.json (vocabulário ADR-0053) + attach por socket no buildScene ([2bdcab8](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2bdcab82a59a01fbbb7aff45a79ef0799f9b6e8f))
* **ide:** Chat IA consome o kit.json (Fase 4+5 do ADR-0053) ([1a81aac](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1a81aac078f8f38ec673d85fb2077079cfa44077))
* **skill:** process-asset-kit — pack bruto → kit curado + vocabulário (ADR-0053) ([47c2459](https://github.com/BuuhV-Projects/cortex-game-engine/commit/47c2459e131724b79b13e9899ad620c891ec5ae3))

# [0.14.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.13.1...v0.14.0) (2026-06-07)


### Features

* **engine:** camada 2D / pixel art (ortográfica, sprite, spritesheet, tilemap) ([f786954](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f786954a19f51d1f8fb2ca252140c9c72a2ab250))
* **ide:** escolher 2D ou 2.5D ao criar projeto (template + Chat IA orientados) ([53b677f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/53b677f6e237b261a8e170d9f215f0932a9b634a))

## [0.13.1](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.13.0...v0.13.1) (2026-06-07)


### Bug Fixes

* **ide:** salvar arquivo aberto via peek/Ctrl+click usa o path real ([7ace6db](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7ace6db93772fdc9469e9451585f48a31543e2af))

# [0.13.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.12.0...v0.13.0) (2026-06-07)


### Features

* **editor:** boot em modo edição + botão Play/Stop (estilo Unity) ([e4aa5b4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e4aa5b47bbab6c4ff175c3ec8a2364c49d42f9ba))

# [0.12.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.11.0...v0.12.0) (2026-06-07)


### Features

* **editor:** heightfield — arrastar pontos + auto-traçar do mesh ([1d1c645](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1d1c6458736241a1787063c42b33aa91576ea94c))

# [0.11.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.10.0...v0.11.0) (2026-06-07)


### Bug Fixes

* **editor:** contorno do collider vira frame de mesh azul (visível no WebGPU) ([464513f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/464513fcd847dc78bfdbf1c6a246329640b4a7da))
* **editor:** desenho de heightfield raycasta no mesh (não no plano de perfil) ([797edb7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/797edb719a9aa4333bbcb487271de94c969e4d7b))
* **editor:** gizmo de collider lê posição do TransformComponent ([b34c8f7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b34c8f7eba63ff5b62a21ba19ed7820bbcf58a8e))
* **editor:** libera todos os eixos no modo edição (3D pleno) ([e027a32](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e027a32785cecab9dd750e4975ce1dfcef398d31))
* **ide:** 'Apagar histórico' também reseta o session_id do Agent SDK ([5b5c241](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5b5c241f48dbda1a633f256d821c4f735f6d7983))
* **ide:** comprime screenshots de playtest pra não estourar 32MB/request ([1053548](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1053548a3b8e1543beee08bc685d0351eb7a42ab))
* **ide:** inspect_assets devolve só a tabela; imagem sob demanda (zero precarga) ([5ab350d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5ab350dacc90c04480471f70923060c22dbb1f78))
* **ide:** não despeja dezenas de thumbnails no contexto (tabela = referência) ([f9f9c1f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f9f9c1f1ebc536d0a1c7ed44abe31c8bc2fb5aab))
* **template:** externaliza logo do splash pra public/logo.png ([80c0442](https://github.com/BuuhV-Projects/cortex-game-engine/commit/80c04422bb2c01d3fb39fe39efad5211e327e423))
* **template:** plataformas alcançáveis e remove textura de água órfã ([a0eb9fc](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a0eb9fc3416d247d29c965d5e255fec116f7677b))


### Features

* **editor:** contorno (AABB) dos colliders no modo edição ([eb5124e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/eb5124ed008d792d857a31f8b1854982576e9c17))
* **editor:** ferramenta de desenhar heightfield clicando no viewport ([4a24ae0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4a24ae0ac4e8df1e6e760008b7b23e3909fec672))
* **editor:** inspector mostra collider 2D do objeto selecionado (read-only) ([6c15838](https://github.com/BuuhV-Projects/cortex-game-engine/commit/6c158384a525d4c7a0ce34ae2a1d39677689213a))
* **engine:** collider 2D ganha formas círculo e cápsula ([6ba36ee](https://github.com/BuuhV-Projects/cortex-game-engine/commit/6ba36ee5f3502903b9feccaa61836f63467b3f86))
* **engine:** collider como propriedade do objeto (autorável no editor, acoplado) ([0df0527](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0df05278d35b36fe4316eadb567c6f458b2819da))
* **engine:** collider heightfield — perfil de chão que o player segue ([578e64b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/578e64b9ae1249a0d554ad1f1e3a53470382025a))
* **engine:** FollowCamera2DSystem expõe pitch (tilt no eixo X) ([a05b3e5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a05b3e509a932e3aa385da5d46a112a71ca6c49c))
* **ide:** jogo ocupa o espaço do editor quando nada está aberto ([756de12](https://github.com/BuuhV-Projects/cortex-game-engine/commit/756de12f0e90aa4ce790905a1d5aa0ab7e5b6f89))

# [0.10.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.9.0...v0.10.0) (2026-06-06)


### Features

* **editor:** pausa gameplay e grava edições no Transform (ponte editor↔ECS) ([eab93bc](https://github.com/BuuhV-Projects/cortex-game-engine/commit/eab93bc95e544d55131842a81d63ae7d5c387778))
* **engine:** câmera 2D-follow do plataformer (XY + roll opcional) [pivô fase 2] ([1c3f464](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1c3f46425cc283fa88fef6b9916b69300cb7b38f))
* **engine:** editor 2.5D — trava no plano XY + snap de grade [pivô fase 4] ([50aa649](https://github.com/BuuhV-Projects/cortex-game-engine/commit/50aa6490471a25467feb78ed19a5e33db934444e))
* **engine:** física de plataforma 2.5D (controller + colisão AABB) [pivô fase 1] ([1f6e807](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1f6e8072ecf6e0d1b063597b689ce4ce6b6f0270))
* **engine:** plataformer jogável data-driven (setupPlatformer + level) [pivô fase 3] ([f617b4f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f617b4f06113016cf3e0d47027a25a32577667ac))
* **ide:** abre imagem como preview, não no editor de código ([9574067](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9574067b4c59a81278bce79155f9e0a20efe9fda))
* **ide:** abre markdown como preview renderizado ([f5cf29a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f5cf29a02113ecd440f74c30f0ca8ae5b373e6ca))
* **ide:** carrega a Game Design Bible no system prompt do Chat IA ([73f23dc](https://github.com/BuuhV-Projects/cortex-game-engine/commit/73f23dc8a1c164440ff44cde69be99063102398f))
* **ide:** reorienta o prompt da IA pra level design de plataforma [pivô fase 5] ([955010b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/955010b1381bf17ab85cce7c741a529a86b291f8))

# [0.9.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.8.0...v0.9.0) (2026-06-05)


### Features

* **engine:** add de asset pela UI do editor [fase 3] ([55aa018](https://github.com/BuuhV-Projects/cortex-game-engine/commit/55aa01840a78eb969354c4cffdf1fb2031d0b1b3))
* **engine:** cena data-driven (SceneDefinition + SceneBuilder) [fase 1] ([496ce2e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/496ce2e3141ac3d0205f3b8f0c7ae24d027f67af)), closes [#9fd6](https://github.com/BuuhV-Projects/cortex-game-engine/issues/9fd6)
* **engine:** editor remove objeto com Delete (preview na sessão) ([4261826](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4261826976f1fbb6fb539237b5b19052fe3b8694))
* **engine:** write-back do editor via overlay (autosave + delete) [fase 2] ([c4ae95d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c4ae95ddaf71b9df680e5d0822e819c27066ccfa))
* **ide:** IA autora cena data-driven (JSON) [fase 4] ([f5f46a5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f5f46a5c03b3754310e9a76213d935785b660f03))
* **ide:** memória de aprendizados + validação de cena por partes em close-up ([9188c70](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9188c7081960323f72a56bf65002779f6ed84ad7))

# [0.8.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.7.0...v0.8.0) (2026-06-05)


### Features

* **engine:** Game.setPostFX destrava atmosfera (pós-processamento) ([cabfedf](https://github.com/BuuhV-Projects/cortex-game-engine/commit/cabfedff55387a8d5d2e5c48131462fa93967e5e))
* **ide:** passe de crítica de beleza via sub-agente (critique_scene) ([ef6aaa0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ef6aaa083e27346ef1a1457ffc54cab61975dad9))
* **ide:** prompt prioriza ATMOSFERA, spec de referência e crítica de beleza ([532ab32](https://github.com/BuuhV-Projects/cortex-game-engine/commit/532ab32434107ccb6239c1b991a11b8247e010d2))

# [0.7.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.6.0...v0.7.0) (2026-06-05)


### Bug Fixes

* **engine:** seleção do editor ignora objetos internos (gizmo) ([d65e28b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d65e28b6178c8b08993f95fc75edf40130825122))
* **ide:** chat IA no app empacotado (asar + PATH do yarn/node) ([55d4d61](https://github.com/BuuhV-Projects/cortex-game-engine/commit/55d4d6134c713404cec59fd4ed7be09b4825b4aa))
* **template:** alinha devUrl do Tauri com a porta do Vite (5174) ([494692e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/494692e540e2b80e828e2aec019321542cd63729))


### Features

* **engine:** facade Game com editor automático dev-only (reativo) ([26c1868](https://github.com/BuuhV-Projects/cortex-game-engine/commit/26c186851e82832cee573b8a09c3759394a9746e))
* **engine:** grounding por bbox, água experimental e exports de textura ([bb25258](https://github.com/BuuhV-Projects/cortex-game-engine/commit/bb25258d64c9fbbe6972288582dbde73f222a63b))
* **engine:** helpers de autoria de cena (assets, iluminação, água v2) ([35b89ba](https://github.com/BuuhV-Projects/cortex-game-engine/commit/35b89bad24237d0def40ae85d0d9ee755a756f8a))
* **engine:** hierarquia e inspector no editor com seleção observável ([2e0b3e2](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2e0b3e22e777305fed6a67daa7ec27f384bebbf0))
* **ide:** atualiza regra de grounding no prompt para a nova API de cena ([bc840d6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/bc840d664d4945fa8c7e2378ac9b89f6aea62df6))
* **ide:** disciplina de grounding e validação de cena no prompt do Chat IA ([c2db722](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c2db7225edf5e0d112aa96c5e5c50ccf2ec3cfb6))
* **ide:** tool inspect_assets e diretrizes de level design no Chat IA ([b76aac4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b76aac45144293a8ef0293f3ee1d75c5465107f3))
* **ide:** vendoriza os 2 bundles e corrige tipos vendorizados ([1eb1093](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1eb109334f7f74978d6f9ea5c91b0e7d7fac14ca))
* **template:** bootstrap via Game (zero editor) + água com cáusticas ([1fe9afa](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1fe9afae0a6f26a73866a9684639369e842793dd))
* **template:** chão cinza neutro (estilo Unity) no starter ([90c527f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/90c527f58d33f92f2ceca9d861b41cc57aa0cd22))
* **template:** liga hierarquia + inspector ao editor F2 ([eaf4769](https://github.com/BuuhV-Projects/cortex-game-engine/commit/eaf4769dd3741daab6d9e23c1b051de4c5d15096))
* **template:** liga o editor embutido no starter e orienta a IA a reusá-lo ([1218b09](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1218b096235a7c25d0c800a16256f6d96dd58d45))
* **template:** starter com água, ilha e iluminação exterior sobre o Editor F2 ([ac0b72d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ac0b72daba63b7faa59465e9f60139c184af9f3e))
* **template:** tsconfig.json + script typecheck no projeto novo ([61f4c48](https://github.com/BuuhV-Projects/cortex-game-engine/commit/61f4c48995543d38ab40e5cb7776c48a6d8109bf))

# [0.6.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.5.0...v0.6.0) (2026-06-01)


### Bug Fixes

* **installer:** empacota recursos do IDE via extraResources ([ca99bdd](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ca99bdde7e44052fdf6fac4ea0b4cb7a88cd3314)), closes [#7512](https://github.com/BuuhV-Projects/cortex-game-engine/issues/7512)


### Features

* **engine:** classe PostFX consolida pós-processamento (pipeline+pass+bloom) ([6af4aa7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/6af4aa7205748984311596fe63ac313ee7f2c3b3))
* **engine:** pós-processamento WebGPU (PostProcessing+TSL) e Skybox/HDRI ([18a19b8](https://github.com/BuuhV-Projects/cortex-game-engine/commit/18a19b8ff176f1988200c24a5202a2942425ff09))
* **engine:** PostFX ganha tone mapping/exposição, vinheta e FXAA ([2d06c51](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2d06c51cec1b577e6516e6719b969af1b1afe5b8))
* **engine:** re-exporta constantes de tone mapping + fxaa/renderOutput ([fb27839](https://github.com/BuuhV-Projects/cortex-game-engine/commit/fb278392474ab410bfed6fb7eb8fa1e2695fd54f))
* **engine:** re-exporta SkeletonUtils.clone para clonar SkinnedMesh ([8a0cf7b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8a0cf7b66851173b8c3a8f3cc7839c79630b1317))
* **ide:** gera doc no build e vendoriza API.md pro Chat IA ([a88f25f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a88f25ffdd0f0cae5655f05f75a3e41fbee49d69))
* **ide:** plan mode no Chat IA (3º modo do toggle) ([a772760](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a7727603ae403f99f56ba01caac81bd26143b6ca))
* **ide:** playtest_game injeta input de teclado e captura logs ([db76c28](https://github.com/BuuhV-Projects/cortex-game-engine/commit/db76c288eecd4cf56e05c257c3c9cc04508d4627))
* **template:** cena starter (céu + chão com névoa + cubo) e expõe Fog ([a574730](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a574730fc5aad6713dcbcea9c859f214d85a1ea3))

# [0.5.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.4.1...v0.5.0) (2026-05-31)


### Bug Fixes

* **ide:** playtest spawna vite como comando único (evita DEP0190) ([ac4a7b0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ac4a7b0bb6157459cfddd3de46c7eb317b37ab13))


### Features

* **engine:** cena em JSON + IO writers + tela de loading (migração fase 5) ([0bd5f77](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0bd5f776c7a3b354dfcdfb0471d69123ce686da7))
* **engine:** componentes de gameplay genéricos + Object3DSyncSystem (migração fase 1) ([d47a749](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d47a7498ae039e5a4c417a61ce69a89fbac5b636))
* **engine:** física cinemática de veículo — gravidade, colisão com deslize, VehiclePhysics (migração fase 2) ([756a1ec](https://github.com/BuuhV-Projects/cortex-game-engine/commit/756a1ec54614956149bda9967a3fd7e37437a363))
* **engine:** modo editor embutido — câmera livre, gizmo, HUD (migração fase 4) ([2c6277a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2c6277a2aaecbf4dcd2331019f34f7b9ec416d64))
* **engine:** renderer baseado em WebGPU (obrigatório, sem fallback WebGL) ([b46cca9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b46cca958e52c199f34f05d684f2e490d34338cc))
* **engine:** ThirdPersonCameraSystem — câmera de perseguição (migração fase 3) ([81bd630](https://github.com/BuuhV-Projects/cortex-game-engine/commit/81bd63053cf3f5e3204bacd7616c2c36029c0a47))
* **ide:** tool playtest_game — Chat IA roda o jogo, screenshot e lê erros ([c526bed](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c526bedf94352fac86416e8d65b9145db412bd98))

## [0.4.1](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.4.0...v0.4.1) (2026-05-31)


### Bug Fixes

* **installer:** copiar recursos de app.asar.unpacked (fs.cp falha dentro do asar) ([139ef28](https://github.com/BuuhV-Projects/cortex-game-engine/commit/139ef2836a3b64cd07bce78796d54704e8244f88))

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
