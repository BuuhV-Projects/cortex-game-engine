/**
 * Entry do **chunk separado do Rapier** (`dist-engine/rapier.js`; TDR-0002). Só
 * re-exporta o namespace do Rapier (com o WASM inline) como default — o bundle base
 * (`index.js`) NÃO embute o Rapier; ele faz `import('@dimforge/rapier3d-compat')`,
 * remapeado no build pra `./rapier.js`, carregado **sob demanda** (lazy) só quando
 * um jogo usa física. Assim projetos sem física não pagam os ~2 MB do WASM.
 */
import RAPIER from '@dimforge/rapier3d-compat';

export default RAPIER;
