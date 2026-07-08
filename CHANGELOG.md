# [0.33.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.32.0...v0.33.0) (2026-07-08)


### Bug Fixes

* **editor:** editor sobrevive à troca de fase (keepOnClear no World.clear) ([0ddee1e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0ddee1e855aa6d05d96b0ca601139db52882d614))
* **editor:** gizmo de seleção (eixos) sobrevive à troca de fase ([ff0ec46](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ff0ec466d2cca86abd1139af9e69d8929aae59d8))
* **export:** rmSync com maxRetries — ENOTEMPTY do Windows ao limpar dist-native ([de56f34](https://github.com/BuuhV-Projects/cortex-game-engine/commit/de56f34043c8ca812e2c217b89b66f8617f35152))
* **native:** color space (sRGB) + MSAA resolveTarget — export identico ao Studio ([5fd6d65](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5fd6d65afe7ca2dd23eb42949779b6525fb14f7b))
* **native:** Image/HTMLImageElement fake — TextureLoader funciona no host ([3dfa335](https://github.com/BuuhV-Projects/cortex-game-engine/commit/3dfa3355c0ac27cec4f5104ba8a4123df4911c2e))
* **native:** janela de tamanho fixo — resolve o crash "ao entrar na fase fecha" ([bd60ffd](https://github.com/BuuhV-Projects/cortex-game-engine/commit/bd60ffdbedbf402c5898f690e594bd8cc8d24b44))
* **native:** janela high-DPI + resolucao real — outline nitido (era upscale borrado) ([4e4588e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4e4588e6090333e816a815e7323a159b5c7b82c3))
* **native:** SSAA usa modelo de dpr (UI nao encolhe no export) — ADR-0103 ([72fa19a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/72fa19abd66fbfbfff1938ff2ba215fbbc2c3114))
* **native:** URL/objectURL (texturas embutidas) + blend states — teste4 100% texturizado ([14fc855](https://github.com/BuuhV-Projects/cortex-game-engine/commit/14fc8557bdab8aa04509d4c515b5a19ecd34f127))
* **scene,dialogue:** runtime do engine usa zod/v3 — validacao REAL no CortexNative ([545e672](https://github.com/BuuhV-Projects/cortex-game-engine/commit/545e672f4810823accc4aca67124d6f380b04914))
* **studio:** centraliza o modal de export (reset global anulava o margin:auto) ([d56d4d5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d56d4d50bbd5ad820230773eb91a5640c897aa74))
* **studio:** export com arquivo travado dá mensagem clara (feche o jogo) ([38a786f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/38a786fa3cb1612ef8eaab81c5d74459aa247542))
* **studio:** export nativo nao exige parar o Play (e mensagem correta) ([0032c47](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0032c471c84f8364a7713d614d43678f17b9f850))
* **studio:** export nativo usava setActiveTab inexistente -> activateTab ([b40c8bb](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b40c8bbe8243f4e7d022aa9c8ec4459728a72122))
* **ui:** backgroundImage carrega no export nativo (fetch + createImageBitmap) ([a12f4c0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a12f4c0b8badf65a06139d38b9ac6d31f848347e))
* **ui:** cores da UI no export nativo batem com o Studio (tone mapping + opacidade) ([867d47a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/867d47addfc1a242656b227dd87cf65b7f8e8bd7)), closes [#ffb03](https://github.com/BuuhV-Projects/cortex-game-engine/issues/ffb03) [#fff3](https://github.com/BuuhV-Projects/cortex-game-engine/issues/fff3) [#a0416](https://github.com/BuuhV-Projects/cortex-game-engine/issues/a0416)
* **ui:** export = Studio no texto (tamanho por em + botao centralizado) ([5e9e23f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5e9e23fc86cbf7f402658fbda1ac6cf31ece9b15))
* **ui:** imagem de fundo aparece no export nativo (mesh reposicionado apos load) ([680fc27](https://github.com/BuuhV-Projects/cortex-game-engine/commit/680fc27eba78ccb2e2b2adaadd777ed52bdf35c6))
* **ui:** painel `fill` acompanha o viewport (fundo cobre o fullscreen) ([4a1cc31](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4a1cc312f9e25cb16772f737f63e75e2aa4d4ffd))
* **ui:** UI do export nativo fora do tone mapping (cores batem com o Studio) ([c62c927](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c62c927bffbd4101d11d03e616918ad1b5fb6f59))
* **ui:** UiTemplate ignora lixo de dev server (script do vite, doctype, meta/link) ([08ebf05](https://github.com/BuuhV-Projects/cortex-game-engine/commit/08ebf05a93ce5cde903fd9b1c0b67c29f077c14a))


### Features

* **engine:** runWithLoadingScreen — tela de loading que dirige o render loop ([7ce1a6f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7ce1a6f8e10a3522cfb28630d4fc2f64baaf4d6c))
* **engine:** voltar ao menu / trocar de fase sem reload (game.reset + teardown) ([2236c19](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2236c1955029598119ea17168a7aa06b6c79c5bf))
* **io:** save assinado + ofuscado (anti-adulteração) — ADR-0107 ([190ec1d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/190ec1d769c949eec81b3d6cd7358a7c7b4376ad))
* **loading:** opção `enabled` — sem tela de loading no editor ([eef86a2](https://github.com/BuuhV-Projects/cortex-game-engine/commit/eef86a2451e304f2615e36d912e807c18654bfb2))
* **materials:** unlit ganha `textured:false` (cor CHAPADA, ignora o map) ([35eb264](https://github.com/BuuhV-Projects/cortex-game-engine/commit/35eb264840b870c8c4b03d85302d4e5152085cd2)), closes [#ffd83](https://github.com/BuuhV-Projects/cortex-game-engine/issues/ffd83)
* **native,engine:** superficie WebGPU completa + environment default — teste4 identico ao Studio ([7d89452](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7d89452b3f8fce2c2c0254c1a2933514d177d963))
* **native:** assets viram um container .pak no export (ADR-0104) ([418c6fc](https://github.com/BuuhV-Projects/cortex-game-engine/commit/418c6fc8ace51e9d53f2c957ac59aa11870fd690))
* **native:** CortexNative M0 — host SDL3 + WebGPU (D3D12) + Hermes (PRD-0004) ([382d6f4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/382d6f47708687fcbfc15097986de4316ef09a74))
* **native:** fullscreen por padrao na resolucao nativa (sharp, sem crash) ([da0d925](https://github.com/BuuhV-Projects/cortex-game-engine/commit/da0d925706c6500dca50c661f968d6293cede4dd))
* **native:** M1 frente 1 — event bus (CustomEvent) + DOM-lite; spec do M1 ([444fd79](https://github.com/BuuhV-Projects/cortex-game-engine/commit/444fd794a72052b2793b2d6692155fe025daa64b))
* **native:** M1 frente 2 — input SDL->JS + Gamepad API; ADR-0095 (export PC = CortexNative) ([daa507b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/daa507b2c750a475e29061cb4620ee7247c1f644))
* **native:** M1 frente 3 — fetch/assets: GLB real do teste4 renderizado com textura ([87d3b86](https://github.com/BuuhV-Projects/cortex-game-engine/commit/87d3b86793b6952281acc0c28a86c3ade722d6f7))
* **native:** M1 frente 4 — Rapier NATIVO (Rust) com a forma da API compat ([d0e56b9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d0e56b91d778a9694644c1ddda1e233765999464))
* **native:** M1 frente 5 — audio nativo (miniaudio decode + streams SDL3) ([1ceebdc](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1ceebdc4c113a4416a297cc5f37daac5aa9b4551))
* **native:** Marco C — triangulo WGSL 100% comandado pelo JS via navigator.gpu ([d38ad40](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d38ad40d3874e99a16902872c3f8185052c3d2a0))
* **native:** Marco D — vertex buffer + uniform + bind group (triangulo girando) ([ae8f3b4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ae8f3b41b169f7f58625f7ecfaa32fa6cdcacc5b))
* **native:** Marco E — CUBO DO THREE.JS GIRANDO no host nativo (M0 CONCLUIDO) ([4a6a985](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4a6a985f80a75b6291d1b8331b7238c368f14b0d))
* **native:** save persistente no host — localStorage sobre user_storage (ADR-0106) ([071139e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/071139e72eb411152eb718fe0f6622ec85319999))
* **native:** SSAA (supersampling) mata o serrilhado do contorno das moedas (ADR-0103) ([ea21f8a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ea21f8a502dc6e8ab0080918bfee3dd5a74d1ee7))
* **native:** TESTE PRATICO — teste4 real bootando e rodando no host ([301c6f6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/301c6f693c0a3d4b0b46088dc9aade2152a645b4))
* **studio:** modal de progresso + overlay bloqueante no export nativo ([8d7217f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8d7217f23e3232fe684d1841196c4a851d9fc10d))
* **ui,native:** M1 CONCLUIDO — UIs do engine migradas + export empacotado + re-vendor ([a30d12c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a30d12c2cc6b909ad480bbc3ae6f088d01527deb))
* **ui/native:** composição da UI de runtime em gama (ADR-0105) ([c909e76](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c909e763c9ab48d21b77115847d4da43c0480419))
* **ui:** estilo rico (gradiente/canto/borda via SDF-TSL) + CSS que compila pro nativo + export no Studio ([12cb606](https://github.com/BuuhV-Projects/cortex-game-engine/commit/12cb6063ab7bd6d60a0a545c1c03dabe7b124e63))
* **ui:** fonte unificada Roboto Medium (Studio == export == Xbox) ([66dc028](https://github.com/BuuhV-Projects/cortex-game-engine/commit/66dc0287eaa92d6c6b8b8bad55f3bd695a73f0f2))
* **ui:** imagem de fundo no UiPanel (backgroundImage) — ADR-0102 ([f983849](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f9838497f04b62174a5bfb54dea6550f58b4eee4))
* **ui:** templates HTML dinamicos (parseUiTemplate/loadUiTemplate) ([830adf9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/830adf98b9c163eebd98290efc1ec13552ac9e06))
* **ui:** UI de runtime com 2 backends (ADR-0102) — fase 6 COMPLETA e provada no teste4 ([421ec2c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/421ec2c6ea244dc40cb942c7689679e194fdad82))


### Performance Improvements

* **physics:** BVH acelera o raycast de colisão do Character (ADR-0108) ([c53d404](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c53d404d0242b104f607e240a5b3826be8bd9bb0))


### Reverts

* **ui:** volta ao TextureLoader (o fetch nao era o fix) — mantem o dirty ([61b6ba4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/61b6ba4d2cf663346d2931e844becd36bcc169f2))

# [0.32.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.31.0...v0.32.0) (2026-07-05)


### Bug Fixes

* **csm:** cascatas seguem a câmera do FRAME (não a do 1º render/editor) ([108c0ab](https://github.com/BuuhV-Projects/cortex-game-engine/commit/108c0abac299d8bde1289e474ac9614df013df75))
* **csm:** seguir só a câmera de visão (perspectiva), não as ortográficas da sombra ([9a01944](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9a019448cc4d6abd9a7a8fe14551c08f658c0908))
* **editor:** cápsula só-visual (contorno limpo) + clique no player por bbox ([11852e1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/11852e10ebc59f92402211ea176a81f1b01eb738))
* **editor:** clicar no player seleciona o player (cápsula vira proxy de clique) ([8da9701](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8da9701abdf758d67ea8edf3eec0574af65e93df))
* **editor:** corrida no seed do overlay podia gravar uma fase por cima da outra ([5521d8c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5521d8c86ccedd0ad0c265387a4fb5626ba4fd7c))
* **editor:** helpers de edição em layer exclusiva da câmera do editor ([c01441e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c01441edb5c45345af44ebc6a530f30b053cdd7b))
* **editor:** remove o helper da luz hemisférica (octaedro no chão) ([3aa1a62](https://github.com/BuuhV-Projects/cortex-game-engine/commit/3aa1a621f6fc01f09f4c2887b55d422afb91e463))
* **editor:** seção Shader mostra o material EFETIVO (nó incluído) ([0b4a731](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0b4a7318a3152e9f7073050dfaa3e7e9622bcaf4))
* **editor:** textura do terreno por 'tile (m)' (ciente da escala) — fim do esticado ([05381a6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/05381a64306155ca2b130e188fe5f04e92cc0e3c))
* **editor:** vegetação volta a ser selecionável (raycast religado) ([4d6d9f2](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4d6d9f2da926e8ffd2600f40ae875f7ba3afc42c))
* **ide:** delega Gamepad API ao iframe de preview (allow=gamepad) ([fff93ab](https://github.com/BuuhV-Projects/cortex-game-engine/commit/fff93ab3c28cab76d0e2c7b07690c2fd91ba1688))
* **ide:** VENDOR_TYPE_MODULES sincronizado com index-runtime — editor resolve scripts/veículo/etc. ([eaca17a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/eaca17a470ebccab11afbd0dc89901a13e2bfccd))
* **physics:** personagem não atravessa morro íngreme (anti-clip do terreno) ([28afa06](https://github.com/BuuhV-Projects/cortex-game-engine/commit/28afa06ff51448e7c0d5f841b8e476b197c81ffb))
* **renderer:** ignora resize/render com canvas 0×0 (WebGPU 'texture of size 0') ([75f93bb](https://github.com/BuuhV-Projects/cortex-game-engine/commit/75f93bbf0f5c69ef12d16374ab0754f0202311d5))
* **road:** conforma malha inteira ao relevo + grade densa (fiel ao Road Architect) ([416c598](https://github.com/BuuhV-Projects/cortex-game-engine/commit/416c5987d7909eddb59faa4d0b15a1b53f19b011))
* **road:** textura da pista granulada/feia — filtragem PBR + curadoria ([2a7b096](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2a7b09603b869ed11000a4ba45c487c275b91fd6))
* **scene:** matte da água autorado no Inspector persiste no reload ([b4f6b62](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b4f6b62e6acc9232b0f4ed6aa169e74f87d64d86))
* **stage:** bake do transform da armature no convert_mixamo (escala p/ three.js) ([f3d8ff5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f3d8ff59d2b633f4c95510989a88820d787dc3ed))
* **stage:** convert_mixamo — material opaco/fosco + aliases de clipe + sem apply ([2006873](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2006873d53527438dde2ed97ca6b43884c28ce65))
* **stage:** remove mapa metallic-roughness do Mixamo (brilho da roupa) ([21d7cf5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/21d7cf57bf8cc0e431a9f2930ee818831b4ac5fd))
* **studio:** árvore de arquivos não perde o scroll no refresh ([65c225b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/65c225ba4ec7736cbe00510078cbb344c3bac018))
* **studio:** doc-close path-aware — glb abre de primeira na aba de preview ([1e0ab98](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1e0ab9800df56263937b90260ef7291fd3d7d79a))
* **studio:** saída do fullscreen do preview — botão flutuante ([e8fa26f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e8fa26f575929bdf06308f11c874773f9af089e3))
* **studio:** transport não pisca mais durante o Play ([8832698](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8832698b00248d91a353e1fc8e5f70c0f300353c))
* **template:** @types/three no template — projetos novos resolvem tipos do three (sem 'any') ([e070bd1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e070bd128e8646e4fc44cd428ff40851fc4f35eb))
* **underlay:** depthTest off + renderOrder alto — overlay translúcido sem z-fight (faixas verdes) ([4d1da9e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4d1da9eba548b725d0f94745078db47b253316e1))
* **vehicle:** chassisOffset — sobe a caixa do chassi acima das rodas (carro flutuava) ([16b5b13](https://github.com/BuuhV-Projects/cortex-game-engine/commit/16b5b131ff19bdc6bee27ab9e07572e72364cc7f))
* **vehicle:** combina gamepad+teclado (teclado dirige mesmo com controle-fantasma) ([e47ea40](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e47ea40ff9e246bb5227fbdaf9260c748656b676))
* **vehicle:** pitch do mouse na chase cam igual ao 3ª pessoa (estava invertido) ([3f2c82b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/3f2c82b010207c1f86bcb6bdb18d95a8637d87cc))
* **vehicle:** rodas giram pela VELOCIDADE (todas), não só tração sob throttle ([4299c75](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4299c75e40c786e7a0f8d639dba19e07c8eb9b98))
* **vehicle:** VehicleControlSystem priority 30 (chase cam vence a 3ª pessoa ao dirigir) ([a64526f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a64526f0374edfb46153148e48caa3bcebf2d4fa))


### Features

* **camera:** modo orbit locked — câmera de perseguição com ângulo fixo ([b0cfbd5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b0cfbd581527d5477e8a98abf64157a2b93c3b00))
* **camera:** occlusion fade — oculta o personagem com a câmera colada ([9409377](https://github.com/BuuhV-Projects/cortex-game-engine/commit/94093770472a0768e44b302b02b4205d9714d259))
* **csm:** fade entre cascatas (default on) — tira a linha de corte da sombra ([4d049a0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4d049a00098cd56d26c985e91d839bc5dcebff08))
* **dialogue:** sistema de diálogo data-driven + 1ª UI de runtime (ADR-0070) ([e27a255](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e27a255d88c2a5b54d031e95aad3affd5cea7c2c))
* **ecs:** entityByObjectName — entidade pelo nome do objeto de cena ([4a279d9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4a279d98b2e26beb3ce469d82573a90d9ccdb5fb))
* **editor:** 'Adicionar Script' vira modal COM BUSCA (estilo Unity) ([f915f4d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f915f4d1e040db1ae11b9148cc5686bb0b4ff72b))
* **editor:** arrastar asset pra cena — FileTree/painel Add → viewport (ADR-0090) ([71fc8f4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/71fc8f474e9a6acb732769e35fe66176d57cfaf6))
* **editor:** caixa de pesquisa no seletor de texturas ([99b07ec](https://github.com/BuuhV-Projects/cortex-game-engine/commit/99b07ec44cfe607a253abcaa2f6cfe3d70c11d33))
* **editor:** CTRL+C/CTRL+V duplica modelos .glb (ADR-0095) ([3f9bede](https://github.com/BuuhV-Projects/cortex-game-engine/commit/3f9bede2c6f3fc0b0b9da98ba7af184fa210f780))
* **editor:** CTRL+Z — fase 1a: CommandStack + undo de transform (gizmo) (ADR-0084) ([022e491](https://github.com/BuuhV-Projects/cortex-game-engine/commit/022e491f5550814cb248a7313ad258a011aced6e))
* **editor:** CTRL+Z fase 1b — undo de adicionar/deletar nó (ADR-0084) ([348e68a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/348e68a50d035ee19e0ef3a3f4f739a4407ccadd))
* **editor:** editar traçado da estrada (handles arrastáveis nos pontos) ([0635743](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0635743914beffb3a5300dc24cd3eae8ba7fbbfa))
* **editor:** expõe curso + amortecimento da suspensão na seção Veículo (ao vivo) ([2365529](https://github.com/BuuhV-Projects/cortex-game-engine/commit/236552924917b4cd508786b5d5254d406b6932d0))
* **editor:** focar top-down em objetos planos (terreno) + far 5000 (não corta o mundo) ([6931865](https://github.com/BuuhV-Projects/cortex-game-engine/commit/69318652cf8b9ad91c357064a333c3b19ed002c5))
* **editor:** gizmo de cápsula 3D pro CharacterBody (estilo Unity) ([85f50c7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/85f50c7a9b30c4532561a65c374e035afc69f475))
* **editor:** level design com .glb — picker com busca, thumbs 3D e desenhar moldado (ADR-0093) ([9d0022b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9d0022b23dc954dc3c8c5091e7efd296f39fbdc4))
* **editor:** modal com preview pra textura do terreno + ADR-0073 ([1708f3a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1708f3a032cb486d8cfb62b85d756b1d485550c8))
* **editor:** névoa OFF + underlay escondido no modo edição (voltam no Play) ([183783e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/183783e66fcbdd9ee8533f443af153e1cbaafa0f))
* **editor:** overlay de cena POR FASE — Game.sceneDataUrl (ADR-0094) ([045e52b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/045e52bb0a57de8f6562141405bd70a7b6a53bea))
* **editor:** picker de áudio do motor na seção Veículo (importa pro projeto) ([3f09a13](https://github.com/BuuhV-Projects/cortex-game-engine/commit/3f09a1346184308d933540583a7e581a02500216))
* **editor:** pincel de espalhar vegetação (ADR-0077, fase 2) ([5eedd6c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5eedd6ce47feb72e11732ae09b40f66292cacc67))
* **editor:** readout de tamanho REAL em metros no inspector (bbox) ([090378e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/090378ed86b0388a4590c2f0bcc11f1badabcdc1))
* **editor:** renomear objeto no Inspector — só nós adicionados (ADR-0091) ([5108a2c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5108a2c52c8032eb2a37e18379ff9202eeec1bb0))
* **editor:** seção 'Veículo' no Inspector (ADR-0081, camada 2 do [#4](https://github.com/BuuhV-Projects/cortex-game-engine/issues/4)) ([d4800ce](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d4800cede9f9efe7fd444ef0c87353910f01956d))
* **editor:** seleção/Delete por instância de árvore (vegetação) ([156410a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/156410a6ddaefa8f278a635024301d6301e6906e))
* **editor:** seletor de modelo da vegetação vira modal com preview ([07a4e79](https://github.com/BuuhV-Projects/cortex-game-engine/commit/07a4e792ebfd6791c6481e85745ff3200f48e128))
* **editor:** Shift aproxima do foco (∝ distância) + voo escala com distância ao chão ([40bbd6d](https://github.com/BuuhV-Projects/cortex-game-engine/commit/40bbd6d15d148a69e0bad5cbe95b534d98ca7622))
* **editor:** Tamanho (m) editável no inspector (metros ⇄ escala) ([9328950](https://github.com/BuuhV-Projects/cortex-game-engine/commit/93289502719b24c7a6a0f5213411ed6bdf8abcef))
* **editor:** toggles de sombra persistem (ShadowAuthoring — data.shadow) ([9e67996](https://github.com/BuuhV-Projects/cortex-game-engine/commit/9e679969079817a11ad1a161ad199db8e8a0f713))
* **editor:** vegetação vira entrada única (modelo escolhido no picker) ([55a30ed](https://github.com/BuuhV-Projects/cortex-game-engine/commit/55a30eda07d4e9cdecfae7ade1103c88fbb63ce7))
* **editor:** voo (WASD/WASD+Shift) escala com a distância ao chão (sem Shift-foco) ([0ba20ce](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0ba20ce56f5512600a890b8694d393eaa4daf8bf))
* **engine:** scripts anexaveis (componente Script no Inspector, MonoBehaviour) — ADR-0085 ([f9b00c3](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f9b00c30bebdc82f97f5d68e02e200d79a56e44d))
* **engine:** setupVehicle — liga carro raycast (Rapier) numa chamada (estilo setupThirdPerson) ([e406538](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e4065388ee1f6c2aac1ba81d5cc810ec2a47c152))
* **gamepad:** fallback pro primeiro pad conectado (slot 0 fantasma) ([100e6a5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/100e6a5e83a90b4b2c302fdc0eb7d6e0eff945ab))
* **input:** engine gamepad-first (Xbox) — poll central + 3ª pessoa no controle ([01e8026](https://github.com/BuuhV-Projects/cortex-game-engine/commit/01e8026870aa48ed5f21da80b5f712af3226431a))
* **input:** gatilhos analógicos (LT/RT) no GamepadManager + fix escala thintree ([383a0ce](https://github.com/BuuhV-Projects/cortex-game-engine/commit/383a0ce71b10ab1b7976dfd1a18aaf8969da5630))
* **interaction:** sistema de action genérico (engine) — ADR-0080 ([29ee78c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/29ee78cfde371af872e1855217fb65c6d14bf176))
* **lighting:** Cascaded Shadow Maps (CSM/WebGPU) pra mundo aberto (ADR-0082) ([c4a57d1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c4a57d10ee5f524523cd67b02f755cd1610e0647))
* **materials:** contorno de silhueta no preset unlit ('unlit toon') ([bd04f23](https://github.com/BuuhV-Projects/cortex-game-engine/commit/bd04f230eb563af999c21d4f4f1210aaab1d39cc))
* **physics:** trimesh collider + VehicleControlSystem (carro físico dirigível) ([80304b2](https://github.com/BuuhV-Projects/cortex-game-engine/commit/80304b2d53111e1d27b6fe5012c59d60bebd715f))
* **physics:** Vehicle — raycast vehicle do Rapier (ADR-0081, supersede 0029) ([21ad7f1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/21ad7f1a09a0fd936bbe5540b0a58ee437621733))
* **player:** controle 3ª pessoa (port do Unity StarterAssets) + personagem GLB ([29d1665](https://github.com/BuuhV-Projects/cortex-game-engine/commit/29d16654d8f35cd6c85221ea7005704d72b8d788))
* **player:** personagem 3ª pessoa com texturas (albedo+normal) e clipes ([471a6e0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/471a6e0e5281b32fb4e0031d05ff0911b97cbaae))
* **player:** trocar personagem pra KayKit (CC0) — anim glTF-nativa, sem licença ([93180da](https://github.com/BuuhV-Projects/cortex-game-engine/commit/93180dae6ba30da90bf0b602fb91df2d5256457c))
* **probuilder:** blockout estilo ProBuilder com nó mesh editável (ADR-0071) ([cc7d9a0](https://github.com/BuuhV-Projects/cortex-game-engine/commit/cc7d9a07fb46ad0146121fea7655e23f50d0b22c))
* **road:** cut&fill — inclinação no Inspector, default 25% e ombro que cola o terreno ([71c33b9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/71c33b94bb1a8aa127f88e65883ff9646728306d))
* **road:** EasyRoad estendido fase 1-2 — perfis + extrusão + RegionSpec(zod) + navGraph (ADR-0087) ([8e163b9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8e163b9a776b656d2bd17716a78faabd4a68c4f0))
* **road:** escolher superfície/largura no Inspector + corrige pista preta ([be5811a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/be5811a69e3a77c5094b68edb582a604281b2d0e))
* **road:** marcação de pista (overlay) — ADR-0076 ([5ee97fe](https://github.com/BuuhV-Projects/cortex-game-engine/commit/5ee97fefb793442dbcb4b21f46b394fa7f727e40))
* **road:** modal de seleção de textura com preview (todas de assets/roads) ([98b0d4f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/98b0d4f0c28174368afef1e7bd706095527d756a))
* **road:** RegionSpec.origin — coords de mapa → mundo (centrado); compileCity aplica (ADR-0087) ([8915ef9](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8915ef9a5ffe67f1d1c03504eabd4769dd0f37d9))
* **road:** renderiza perfil via nó road (Group conformado) + compileCity (ADR-0087) ([696b43c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/696b43c7695efa25272694e59dbadda253ad1c5a))
* **road:** sistema de estradas por spline — Fase 1 (ADR-0072) ([c2eed37](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c2eed378d2becd738c9e094c61570c8ba878e4b2))
* **road:** terreno se adapta à pista (cut & fill) — ADR-0075 ([4eb045c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4eb045c216ec1ab99853a50e7bfb15598a37bc84))
* **road:** tessellation adaptativa da spline (curvas mais lisas) ([fe4a680](https://github.com/BuuhV-Projects/cortex-game-engine/commit/fe4a680dd34ea97963667077bc5fe64485c411a0))
* **scene:** config do veículo como DADO (campo vehicle no nó) — base do Inspector ([a31ae6b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a31ae6b38e419430e1c87c2e291e2b71d7b4f9e6)), closes [#4](https://github.com/BuuhV-Projects/cortex-game-engine/issues/4)
* **scene:** HDRI sky + hemisphere/ambient no outdoorLighting da cena ([8c8e4bf](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8c8e4bf6ded4b9594ff7a924eb850d90912b5b39))
* **scene:** underlay — imagem de referência no chão pra blockout (ADR-0083) ([f29f422](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f29f42246eb7f4228816241d7ea4b3ae088a6d62))
* **scripts:** auto-registro da pasta scripts/ — nome pelo arquivo (ADR-0096) ([29d3df6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/29d3df60a177caa8e645a0ae053c605145d3ddac))
* **skybox:** céu gradiente procedural (Skybox.fromGradient) data-driven ([b3350b4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b3350b4be93d0fc342994fce680fc1ed0c02e7d8))
* **studio:** abas de preview estilo VSCode nos doc-tabs ([fdedee2](https://github.com/BuuhV-Projects/cortex-game-engine/commit/fdedee2690890d66d1902b6470710645a00c5520))
* **third-person:** colisão de câmera (spring arm) — não atravessa chão/objetos ([94de4ad](https://github.com/BuuhV-Projects/cortex-game-engine/commit/94de4ad96ae3df1267e8e5607e40227678b8989a))
* **third-person:** combina pauseWhen do jogo com a pausa interna ([ec5ed1f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ec5ed1fad2204d33bfbfc8769339115d6477a467))
* **third-person:** jumpBlocked + playAction (one-shot do jogo, ex.: soco) ([d07eae5](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d07eae507f0a4e59efab951a451d6e0a05ed6225))
* **third-person:** transições run_stop / run_jump ([c855fea](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c855fea18fa90a9404c0ac54819cc0aa734a2dfa))
* **vegetation:** colisão, modelo default real e folhas alpha-cutout ([0ed5624](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0ed56246a8f717cb5c9f9cd5f6675bbd2e4dc057))
* **vegetation:** núcleo instanciado + nó vegetation (ADR-0077, fase 1) ([a62b7b6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a62b7b6ee377cb85453b8914c521af91bc86f124))
* **vegetation:** seletor de modelo (.glb real) no pincel ([b4c0079](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b4c007957fc6b3dee2687862f0df0bd86afea3dd))
* **vehicle:** 'agilidade na curva' (yawInertiaScale) ao vivo — corrige carro pesado pra virar ([2f528fd](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2f528fd8c3d10ff2d55c9b07ee7ac2077bd6e827))
* **vehicle:** anti-capotamento — centro de massa explícito baixo + esterço por velocidade ([2c27f27](https://github.com/BuuhV-Projects/cortex-game-engine/commit/2c27f27411ff8f989de3df73114330bc2b06bc07))
* **vehicle:** chase cam ORBITAL (mouse + 2º stick) com auto-follow atrás ([4e4d166](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4e4d1666d0b0b9dcb98efac92e251a2522736136))
* **vehicle:** estabilizador anti-capotamento (keepUpright) — corrige rolagem sem mexer no esterço ([8663cfd](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8663cfdf1a0ca6a10b60ffb188d14b835262102e))
* **vehicle:** fallback teclado quando não há controle (W/S/A/D + setas) ([fb3439e](https://github.com/BuuhV-Projects/cortex-game-engine/commit/fb3439ee37a80642ad1751a48e47d584ce774295))
* **vehicle:** freio no Espaço/A (handbrake), rodas giram/esterçam, esterço mais forte ([f01eb1a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/f01eb1a497b3503431ac41317072d0e49eea38ef))
* **vehicle:** gripScale por roda (front/rear grip split) — FWD com traseira solta ([b18f916](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b18f9160c205f3d2d398b1b7fcb718f167692493))
* **vehicle:** handbrake mais forte (handbrakeForce 120) + maxSteer default 0.7 ([4cc8032](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4cc803221401dccc3b743042badc8c6c03e65237))
* **vehicle:** rampa de acelerador + freio-motor (resistência ao rolamento) ([39d1ff1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/39d1ff17a2e4ff875bbc71e5bffcf6d17f8ef958))
* **vehicle:** setMassProperties — massa + centro de massa AO VIVO (sem reload) ([e23b708](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e23b708b7654372e3ca5be0070e2f4f51feebd06))
* **vehicle:** som de motor (EngineSound) — loop + pitch pela velocidade ([4ec39d6](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4ec39d6a9955eb61cec34af9453b68f18891b07f))
* **vehicle:** som de motor com MARCHAS (pitch sobe e cai na troca) no lugar do crossfade de volume ([4dc8f44](https://github.com/BuuhV-Projects/cortex-game-engine/commit/4dc8f442dd62da299f569c2b6c267652cf100435))
* **vehicle:** som de motor EM CAMADAS + ré forte/limitada + teto de velocidade ([ace4139](https://github.com/BuuhV-Projects/cortex-game-engine/commit/ace413911b4cf35ff9da9e3f9761015d64d39b63))
* **vehicle:** Vehicle.applyTuning — suspensão/grip ao vivo (sem reiniciar) ([0237a4c](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0237a4c11e3fd41ea9808c647f7ad1281e22c3a3))
* **vehicle:** velocímetro (Speedometer) + marcas de pneu (SkidMarkSystem) nativos ([8f2074f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/8f2074fef180e02796cad6b1889956b5170fdb21))
* **vehicle:** wheelspin visual — rodas com tração giram extra sob aceleração ([872bea4](https://github.com/BuuhV-Projects/cortex-game-engine/commit/872bea4cf60eca3b6ccf39b6d81f06d4f7206a1f))


### Performance Improvements

* **physics:** raycast do personagem só na geometria relevante (road 5fps→fluido) ([7f85e01](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7f85e0115d4449381154bb74e772d71cfa36a0f1))
* **scene:** desliga raycast da malha do personagem (FPS no play) ([d3dd532](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d3dd5325316da03b56a4b48cc274171178d1b63c))
* **vegetation:** tira a floresta dos raycasts do personagem (5fps→fluido) ([0fd5400](https://github.com/BuuhV-Projects/cortex-game-engine/commit/0fd54009f2b0ffc15bb4cb0f21977f86c905156e))

# [0.31.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.30.1...v0.31.0) (2026-06-16)


### Features

* **core:** multi-cena via game.setActiveScene (+ export PerspectiveCamera/Ortho) ([093ec3a](https://github.com/BuuhV-Projects/cortex-game-engine/commit/093ec3a7435faf55bc3b7ddbe17f1331a827914a))
* **scene:** personagem modular (composeModularCharacter) p/ criador ([63f22da](https://github.com/BuuhV-Projects/cortex-game-engine/commit/63f22da3e50e7b6e030f7c3a541dcd14de990957))
* **topdown:** moveSpeed dinâmico (número ou função por frame) ([033ead7](https://github.com/BuuhV-Projects/cortex-game-engine/commit/033ead766c323472a21a3e15b92fa9ebc165898a))

## [0.30.1](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.30.0...v0.30.1) (2026-06-15)


### Bug Fixes

* **input:** GamepadManager reconecta o controle via eventos do window ([b092d88](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b092d888870ec739a73878bdb5e7fe30fdfc6bf2))

# [0.30.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.29.0...v0.30.0) (2026-06-15)


### Bug Fixes

* **physics:** estabilizar aterrar de Character no terreno ([92bc43b](https://github.com/BuuhV-Projects/cortex-game-engine/commit/92bc43bb453f61892b09714552828153b14683fe))
* **physics:** footOffset — character com mesh de origem central não afunda ([23e5b33](https://github.com/BuuhV-Projects/cortex-game-engine/commit/23e5b339faba11a74a39ddabb11ec8aea6055653))


### Features

* **engine:** demo padrão em 1ª pessoa (terreno + player cápsula) ([d8501c1](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d8501c1b843bf470888b81eca2c2c4addac0775a))
* **engine:** setupTopDown + movimento top-down por eixo (input é do jogo) ([e47702f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e47702f122db519c0614ac4be5e11735130304fa))
* **physics:** expor impulso/velocidade/reset no PhysicsBody ([7b7c697](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7b7c697b4aef7052b9aca600b04809633dea2725))

# [0.29.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.28.0...v0.29.0) (2026-06-13)


### Bug Fixes

* **terrain:** blend de splat via TSL/NodeMaterial (onBeforeCompile não roda no WebGPURenderer) ([397cd43](https://github.com/BuuhV-Projects/cortex-game-engine/commit/397cd43fbeca5a2d5b1e9799572f67be0cd82aa8))


### Features

* **terrain:** pintura de textura com pincel (modo texturizar) no editor ([d3eccef](https://github.com/BuuhV-Projects/cortex-game-engine/commit/d3eccef99f38bb27a9397a975319135421a23bba))

# [0.28.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.27.0...v0.28.0) (2026-06-11)


### Features

* **core:** logger de debug por escopo (debug/setDebug) ligado via .env ([a6da699](https://github.com/BuuhV-Projects/cortex-game-engine/commit/a6da6990eb6d5a8056c30e996f05ee0c09ced5df))

# [0.27.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.26.0...v0.27.0) (2026-06-11)


### Bug Fixes

* **editor:** OverlayStore lê overlay.data dinamicamente (autoria não persistia) ([c7d2394](https://github.com/BuuhV-Projects/cortex-game-engine/commit/c7d2394af55ce7305e5acbf52818f947c1740a79))
* **physics:** grava a troca de tipo de física na hora (persist imediato) ([255c267](https://github.com/BuuhV-Projects/cortex-game-engine/commit/255c2676da725255822c26b9e3d6299e93eb6acb))


### Features

* **editor:** autoria de corpo Rapier no Inspector — Tipo de corpo "Rígido" (ADR-0061) ([262c567](https://github.com/BuuhV-Projects/cortex-game-engine/commit/262c567c0c34918d2bdc79e3d1cad8f885bf3c6a))
* **editor:** bloqueia autoria de física em objetos criados em código (não-nós) ([e3577d3](https://github.com/BuuhV-Projects/cortex-game-engine/commit/e3577d324f331817d3ec2c0b2a21ad52f0f4f7bf))
* **scene:** rapierBody data-driven — física dinâmica no level.json (ADR-0061) ([cbea85f](https://github.com/BuuhV-Projects/cortex-game-engine/commit/cbea85f26b2c9525c2280f0f8114726c06876478))

# [0.26.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.25.0...v0.26.0) (2026-06-11)


### Features

* **physics:** integração Rapier↔ECS — RapierBodyComponent + RapierPhysicsSystem (ADR-0061) ([6525a42](https://github.com/BuuhV-Projects/cortex-game-engine/commit/6525a4287af7e2a937003c76c139d9c3335303ad))
* **physics:** spike Rapier — wrapper headless + TDD (fase 2, TDR-0002) ([1bb6f44](https://github.com/BuuhV-Projects/cortex-game-engine/commit/1bb6f44407262d785731de7f36770505ced33d29))

# [0.25.0](https://github.com/BuuhV-Projects/cortex-game-engine/compare/v0.24.0...v0.25.0) (2026-06-11)


### Bug Fixes

* **character:** geometria vence o piso de fallback (não boia no ar) ([b96c2cc](https://github.com/BuuhV-Projects/cortex-game-engine/commit/b96c2ccc09d200230e3f44c0469ef39b63f437d9))
* **character:** remove grounding por raycast (tremia) — piso plano groundY estável ([36c1d42](https://github.com/BuuhV-Projects/cortex-game-engine/commit/36c1d42eb420f11537957cf3729ea46a48653d66))


### Features

* **character:** gravidade com colisão real (tipo Unity) + piso de fallback ([7d409aa](https://github.com/BuuhV-Projects/cortex-game-engine/commit/7d409aa0a5f378d03cbe1fdfd04534d1954a4bb6))

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
