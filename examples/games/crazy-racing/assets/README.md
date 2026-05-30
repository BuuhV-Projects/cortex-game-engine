# assets/

Arquivos binários do jogo: `.glb`/`.gltf` (modelos 3D), texturas
(`.png`/`.jpg`), sons (`.mp3`/`.wav`). Nada de TypeScript aqui.

Modelos gerados pela tool `generate_blender_model` do chat IA são
salvos aqui por padrão.

## Carregar

Use o `AssetLoader` do `cortex-game-engine`:

```ts
import { AssetLoader } from 'cortex-game-engine'

const loader = new AssetLoader()
const gltf = await loader.loadGLTF('./assets/sword.glb')
scene.add(gltf.scene)
```

## Organização sugerida quando crescer

```
assets/
├── models/   *.glb
├── textures/ *.png, *.jpg
└── sounds/   *.mp3, *.wav
```
