// WebAudio-lite — a forma da API que o THREE.Audio/AudioLoader usam,
// sobre o áudio nativo (__cortexAudio). Grafo simplificado: assume
// source → [gain...] → destination; volume = produto dos gains da cadeia.
// Each voice keeps its whole chain: a change on any link recomputes the full
// product (SPEC-0607), never just "that node down" (the master used to erase
// each sound's own volume).
// PannerNode (PositionalAudio) atenua pela distância ao ouvinte (SPEC-0700):
// o fator entra na cadeia como mais um elo. Pan estéreo, cone e orientação
// seguem ignorados (pendência da SPEC-0700: o host só tem ganho por voz).
// suspend()/resume() calam e devolvem o ganho de toda voz viva (SPEC-0701).

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

/** Product of the gains of a chain (a panner adds its distance factor). */
function chainGain(chain) {
  let gain = 1;
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    if (node.gain) gain *= node.gain.value;
    if (node.__distanceGain) gain *= node.__distanceGain();
  }
  return gain;
}

/** Gain sent to the host: muted while the context is suspended (SPEC-0701). */
function voiceGain(source) {
  return source.context.__suspended ? 0 : chainGain(source.__chain);
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
    else __cortexAudio.setGain(source.__voice, voiceGain(source));
  }
  // A panner without voices stops following the listener (not retained by the context).
  if (this.__sources.size === 0) this.context.__livePanners.delete(this);
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
  this.__position = { x: 0, y: 0, z: 0 };
}
PannerNode.prototype = Object.create(GainNode.prototype);
// Only the setPosition path: without positionX the THREE uses it (SPEC-0700).
PannerNode.prototype.setPosition = function (x, y, z) {
  this.__position.x = x;
  this.__position.y = y;
  this.__position.z = z;
  this.__updateVoices();
};
PannerNode.prototype.setOrientation = function () {};
/** WebAudio distance model gain (inverse / linear / exponential) to the listener. */
PannerNode.prototype.__distanceGain = function () {
  const p = this.__position;
  const l = this.context.listener.__position;
  const distance = Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z);
  const ref = this.refDistance;
  const rolloff = this.rolloffFactor;
  if (this.distanceModel === 'linear') {
    const max = this.maxDistance;
    if (max <= ref) return 1;
    const clamped = Math.min(Math.max(distance, ref), max);
    return 1 - Math.min(Math.max(rolloff, 0), 1) * (clamped - ref) / (max - ref);
  }
  if (ref <= 0) return distance > 0 ? 0 : 1;
  const d = Math.max(distance, ref);
  if (this.distanceModel === 'exponential') return Math.pow(d / ref, -rolloff);
  return ref / (ref + rolloff * (d - ref));
};

/** playbackRate as an AudioParam: a change with a live voice reaches the host (SPEC-0700). */
function RateParam(source) {
  this.__source = source;
  this.__value = 1;
}
Object.defineProperty(RateParam.prototype, 'value', {
  get() { return this.__value; },
  set(v) {
    const source = this.__source;
    const old = this.__value > 0 ? this.__value : 1;
    this.__value = v;
    if (!source.__voice || !(v > 0)) return;
    __cortexAudio.setRate(source.__voice, v);
    // The one-shot voice now ends sooner/later: rescale what is left.
    const now = source.context.currentTime;
    if (source.__endsAt !== Infinity && source.__endsAt > now) {
      source.__endsAt = now + (source.__endsAt - now) * old / v;
    }
  },
});
RateParam.prototype.setTargetAtTime = function (v) { this.value = v; };
RateParam.prototype.setValueAtTime = function (v) { this.value = v; };
RateParam.prototype.linearRampToValueAtTime = function (v) { this.value = v; };

function BufferSourceNode(context) {
  this.context = context;
  this.buffer = null;
  this.loop = false;
  this.loopStart = 0;
  this.loopEnd = 0;
  this.playbackRate = new RateParam(this);
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
  /** Seconds into the buffer the voice starts at (`start(when, offset)`). */
  this.__offset = 0;
}
// A voz nativa nasce quando a fonte está iniciada E ligada (SPEC-0341): o
// THREE.Audio.play() chama start() ANTES de connect(), e fonte sem ligação é
// muda no WebAudio. Nascer no start() tocava com ganho 1 e fora dos GainNode.
BufferSourceNode.prototype.__startVoice = function () {
  if (!this.__started || this.__voice || !this.__next) return;
  this.__chain = chainOf(this.__next);
  this.__voice = __cortexAudio.play(
    this.buffer.__id, this.loop ? 1 : 0, voiceGain(this), this.playbackRate.value, this.__offset,
  );
  // one-shots end in the host without a stop(): the expired ones leave here, not only on the next pause
  this.context.__pruneVoiced();
  this.context.__voiced.add(this);
  const rate = this.playbackRate.value > 0 ? this.playbackRate.value : 1;
  const left = Math.max(this.buffer.duration - this.__offset, 0);
  this.__endsAt = this.loop ? Infinity : this.context.currentTime + left / rate;
  // registra a fonte nos gains da cadeia (volume ao vivo — ex.: BGM)
  for (const node of this.__chain) {
    if (node.__sources) node.__sources.add(this);
    if (node.__distanceGain) this.context.__livePanners.add(node);
  }
};
BufferSourceNode.prototype.connect = function (node) {
  this.__next = node;
  this.__startVoice();
  return node;
};
BufferSourceNode.prototype.disconnect = function () { this.__next = null; };
BufferSourceNode.prototype.start = function (when, offset) {
  if (!this.buffer) return;
  this.__offset = offset > 0 ? offset : 0;
  this.__started = true;
  this.__startVoice();
};
BufferSourceNode.prototype.stop = function () {
  this.__started = false;
  if (this.__voice) {
    __cortexAudio.stop(this.__voice);
    this.context.__voiced.delete(this);
    for (const node of this.__chain) if (node.__sources) node.__sources.delete(this);
    this.__voice = 0;
  }
  // 'ended' is async in WebAudio: THREE.Audio.pause() does stop() then
  // `onended = null`, and a sync call reset its progress (resume restarted).
  Promise.resolve().then(() => { if (this.onended) this.onended(); });
};

function AudioListenerLite(context) {
  this.context = context;
  this.__position = { x: 0, y: 0, z: 0 };
}
// Moving the listener recomputes the voices of every panner that has one.
AudioListenerLite.prototype.setPosition = function (x, y, z) {
  this.__position.x = x;
  this.__position.y = y;
  this.__position.z = z;
  for (const panner of this.context.__livePanners) panner.__updateVoices();
};
AudioListenerLite.prototype.setOrientation = function () {};

function AudioContextLite() {
  this.state = 'running';
  this.sampleRate = 44100;
  this.destination = { __next: null, connect: function () {}, disconnect: function () {} };
  /** Panners with a live voice: the ones the listener's moves recompute. */
  this.__livePanners = new Set();
  /** Sources with a live voice: the ones suspend/resume reach (SPEC-0701). */
  this.__voiced = new Set();
  this.__suspended = false;
  this.listener = new AudioListenerLite(this);
}
Object.defineProperty(AudioContextLite.prototype, 'currentTime', {
  get() { return performance.now() / 1000; },
});
/** Drops the sources whose voice is gone (stopped, or a one-shot past its expected end). */
AudioContextLite.prototype.__pruneVoiced = function () {
  const now = this.currentTime;
  for (const source of this.__voiced) {
    if (!source.__voice || now >= source.__endsAt) this.__voiced.delete(source);
  }
};
/** Sends each live voice its gain (0 while suspended). */
AudioContextLite.prototype.__applySuspend = function (suspended) {
  this.__suspended = suspended;
  this.state = suspended ? 'suspended' : 'running';
  this.__pruneVoiced();
  for (const source of this.__voiced) __cortexAudio.setGain(source.__voice, voiceGain(source));
  return Promise.resolve();
};
// No host-side pause: suspend mutes every live voice and resume gives each its chain gain back (SPEC-0701).
AudioContextLite.prototype.resume = function () { return this.__applySuspend(false); };
AudioContextLite.prototype.suspend = function () { return this.__applySuspend(true); };
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
