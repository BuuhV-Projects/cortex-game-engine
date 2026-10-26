// WebAudio-lite — a forma da API que o THREE.Audio/AudioLoader usam,
// sobre o áudio nativo (__cortexAudio). Grafo simplificado: assume
// source → [gain...] → destination; volume = produto dos gains da cadeia.
// Each voice keeps its whole chain: a change on any link recomputes the full
// product (SPEC-0607), never just "that node down" (the master used to erase
// each sound's own volume).
// PannerNode (PositionalAudio) toca sem espacialização por enquanto
// (pendência M1 — volume/pitch funcionam).

function GainParam(node) {
  this.__node = node;
  this.__value = 1;
}
Object.defineProperty(GainParam.prototype, 'value', {
  get() { return this.__value; },
  set(v) {
    this.__value = v;
    this.__node.__updateVoices();
  },
});
GainParam.prototype.setTargetAtTime = function (v) { this.value = v; };
GainParam.prototype.setValueAtTime = function (v) { this.value = v; };
GainParam.prototype.linearRampToValueAtTime = function (v) { this.value = v; };

/** Max nodes walked down a chain (source → gains → destination). */
const CHAIN_MAX = 8;

/** The nodes from `node` down to the destination. */
function chainOf(node) {
  const chain = [];
  for (let current = node, i = 0; i < CHAIN_MAX && current; i++, current = current.__next) chain.push(current);
  return chain;
}

/** Product of the gains of a chain. */
function chainGain(chain) {
  let gain = 1;
  for (let i = 0; i < chain.length; i++) if (chain[i].gain) gain *= chain[i].gain.value;
  return gain;
}

function GainNode(context) {
  this.context = context;
  this.gain = new GainParam(this);
  this.__next = null;
  /** Sources with a live voice whose chain goes through this node. */
  this.__sources = new Set();
}
GainNode.prototype.connect = function (node) { this.__next = node; return node; };
GainNode.prototype.disconnect = function () { this.__next = null; };
GainNode.prototype.__updateVoices = function () {
  const now = this.context.currentTime;
  for (const source of this.__sources) {
    // A one-shot voice ends in the host without telling the JS: dropped by its expected end.
    if (!source.__voice || now >= source.__endsAt) this.__sources.delete(source);
    else __cortexAudio.setGain(source.__voice, chainGain(source.__chain));
  }
};

function PannerNode(context) {
  GainNode.call(this, context);
  this.panningModel = 'HRTF';
  this.refDistance = 1;
  this.rolloffFactor = 1;
  this.distanceModel = 'inverse';
  this.maxDistance = 10000;
  this.coneInnerAngle = 360;
  this.coneOuterAngle = 360;
  this.coneOuterGain = 0;
}
PannerNode.prototype = Object.create(GainNode.prototype);
PannerNode.prototype.setPosition = function () {};
PannerNode.prototype.setOrientation = function () {};

function BufferSourceNode(context) {
  this.context = context;
  this.buffer = null;
  this.loop = false;
  this.loopStart = 0;
  this.loopEnd = 0;
  this.playbackRate = {
    value: 1,
    setValueAtTime: function (v) { this.value = v; },
    setTargetAtTime: function (v) { this.value = v; },
  };
  this.detune = {
    value: 0,
    setValueAtTime: function (v) { this.value = v; },
    setTargetAtTime: function (v) { this.value = v; },
    linearRampToValueAtTime: function (v) { this.value = v; },
  };
  this.onended = null;
  this.__next = null;
  this.__voice = 0;
  this.__started = false;
  /** Nodes the voice goes through, from the first after the source to the destination. */
  this.__chain = null;
  /** `currentTime` the voice ends at (`Infinity` in loop). */
  this.__endsAt = Infinity;
}
// A voz nativa nasce quando a fonte está iniciada E ligada (SPEC-0341): o
// THREE.Audio.play() chama start() ANTES de connect(), e fonte sem ligação é
// muda no WebAudio. Nascer no start() tocava com ganho 1 e fora dos GainNode.
BufferSourceNode.prototype.__startVoice = function () {
  if (!this.__started || this.__voice || !this.__next) return;
  this.__chain = chainOf(this.__next);
  this.__voice = __cortexAudio.play(
    this.buffer.__id, this.loop ? 1 : 0, chainGain(this.__chain), this.playbackRate.value,
  );
  const rate = this.playbackRate.value > 0 ? this.playbackRate.value : 1;
  this.__endsAt = this.loop ? Infinity : this.context.currentTime + this.buffer.duration / rate;
  // registra a fonte nos gains da cadeia (volume ao vivo — ex.: BGM)
  for (const node of this.__chain) if (node.__sources) node.__sources.add(this);
};
BufferSourceNode.prototype.connect = function (node) {
  this.__next = node;
  this.__startVoice();
  return node;
};
BufferSourceNode.prototype.disconnect = function () { this.__next = null; };
BufferSourceNode.prototype.start = function () {
  if (!this.buffer) return;
  this.__started = true;
  this.__startVoice();
};
BufferSourceNode.prototype.stop = function () {
  this.__started = false;
  if (this.__voice) {
    __cortexAudio.stop(this.__voice);
    for (const node of this.__chain) if (node.__sources) node.__sources.delete(this);
    this.__voice = 0;
  }
  if (this.onended) this.onended();
};

function AudioListenerLite(context) {
  this.context = context;
}
AudioListenerLite.prototype.setPosition = function () {};
AudioListenerLite.prototype.setOrientation = function () {};

function AudioContextLite() {
  this.state = 'running';
  this.sampleRate = 44100;
  this.destination = { __next: null, connect: function () {}, disconnect: function () {} };
  this.listener = new AudioListenerLite(this);
}
Object.defineProperty(AudioContextLite.prototype, 'currentTime', {
  get() { return performance.now() / 1000; },
});
AudioContextLite.prototype.resume = function () { return Promise.resolve(); };
AudioContextLite.prototype.suspend = function () { return Promise.resolve(); };
AudioContextLite.prototype.close = function () { return Promise.resolve(); };
AudioContextLite.prototype.createGain = function () { return new GainNode(this); };
AudioContextLite.prototype.createPanner = function () { return new PannerNode(this); };
AudioContextLite.prototype.createBufferSource = function () {
  return new BufferSourceNode(this);
};
AudioContextLite.prototype.decodeAudioData = function (data, onLoad, onError) {
  const decoded = __cortexAudio.decode(data);
  if (!decoded) {
    const error = new Error('decodeAudioData: formato não suportado');
    if (onError) onError(error);
    return Promise.reject(error);
  }
  const buffer = {
    __id: decoded.id,
    duration: decoded.duration,
    sampleRate: decoded.sampleRate,
    numberOfChannels: decoded.channels,
    length: Math.floor(decoded.duration * decoded.sampleRate),
    // Libera o PCM decodificado no lado nativo (ADR-0153) — o AudioBuffer do
    // browser não tem isto; o engine chama via duck-typing (`free?.()`) no
    // despejo de caches. Idempotente (id zerado após o 1º free).
    free() {
      if (this.__id) __cortexAudio.free(this.__id);
      this.__id = 0;
    },
  };
  if (onLoad) onLoad(buffer);
  return Promise.resolve(buffer);
};

export function installWebAudioLite() {
  globalThis.AudioContext = AudioContextLite;
  globalThis.webkitAudioContext = AudioContextLite;
}
