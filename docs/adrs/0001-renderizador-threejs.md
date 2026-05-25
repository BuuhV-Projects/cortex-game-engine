# 0001 - Renderizador baseado em Three.js

**Data:** 2026-05-24
**Status:** aceito

## Contexto

O motor de jogo precisa de um sistema de renderização 3D que rode no navegador (e opcionalmente no Node.js via headless). As opções avaliadas foram:

- **Raw WebGL**: máximo controle, mas requer implementação completa de shaders, pipeline de renderização, gerenciamento de buffers — custo de desenvolvimento muito alto.
- **Babylon.js**: engine completo, mas pesado e com opinião própria sobre arquitetura de cena, reduzindo nossa flexibilidade.
- **Three.js**: biblioteca de rendering 3D amplamente adotada, API estável, ecossistema rico (GLTFLoader, loaders de física, pós-processamento), peso razoável e sem impor arquitetura de jogo.

## Decisão

Usar **Three.js** como camada de renderização. O motor expõe uma classe `Renderer` (`src/core/Renderer.js`) que encapsula `THREE.WebGLRenderer`, gerencia o canvas, câmera padrão e redimensionamento automático. O `AssetLoader` (`src/core/AssetLoader.js`) usa `THREE.TextureLoader`, `GLTFLoader` e `THREE.AudioLoader`. O sistema de áudio usa `THREE.AudioListener` e `THREE.PositionalAudio`.

A integração com Three.js é confinada ao módulo `src/core/` — o restante do engine (ECS, AI, CLI) não importa Three.js diretamente, preservando testabilidade.

## Consequências

- **Positivo**: curva de aprendizado baixa, grande comunidade, suporte nativo a GLTF (formato de saída do Blender).
- **Positivo**: integração natural com modelos gerados pelo Blender exportados como `.glb/.gltf`.
- **Negativo**: Three.js não é um engine de jogo; sistemas como física, ECS e loop precisam ser implementados separadamente.
- **Negativo**: bundle inclui Three.js (~600 KB minificado); aceito dado o escopo do projeto.
