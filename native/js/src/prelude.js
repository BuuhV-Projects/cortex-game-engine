// Prelude — shims de browser escritos em JS (importado ANTES do three).
// Regra do projeto: o que dá pra shimar em JS fica AQUI (js/src/shims/);
// C++ só pro que toca GPU/SO de verdade (src/webgpu/, src/shims/).
import { installGlobals } from './shims/globals.js';
import { installEventClasses } from './shims/event-target.js';
import { installDomLite } from './shims/dom-lite.js';
import { installWebGpuExtras, createCanvas } from './shims/webgpu-extras.js';
import { installInputBridge } from './shims/input-bridge.js';
import { installTextShims } from './shims/text.js';
import { installNetShims } from './shims/net.js';
import { installImageShims } from './shims/image.js';

installGlobals();
installEventClasses();
installDomLite();
installWebGpuExtras();
installInputBridge();
installTextShims();
installNetShims();
installImageShims();

globalThis.__cortexCreateCanvas = createCanvas;
