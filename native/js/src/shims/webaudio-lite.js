// WebAudio-lite — a forma da API que o THREE.Audio/AudioLoader usam,
// sobre o áudio nativo (__cortexAudio). Grafo simplificado: assume
// source → [gain...] → destination; volume = produto dos gains da cadeia.
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

function chainGain(node) {
  let gain = 1;
  let current = node;
  for (let i = 0; i < 8 && current; i++) {
    if (current.gain) gain *= current.gain.value;
    current = current.__next;
  }
  return gain;
}

function GainNode(context) {
  this.context = context;
  this.gain = new GainParam(this);
  this.__next = null;
  this.__voices = [];
}
GainNode.prototype.connect = function (node) { this.__next = node; return node; };
GainNode.prototype.disconnect = function () { this.__next = null; };
GainNode.prototype.__updateVoices = function () {
  const gain = chainGain(this);
  for (const voice of this.__voices) __cortexAudio.setGain(voice, gain);
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
  this.detune = { value: 0 };
  this.onended = null;
  this.__next = null;
  this.__voice = 0;
}
BufferSourceNode.prototype.connect = function (node) {
  this.__next = node;
  return node;
};
BufferSourceNode.prototype.disconnect = function () { this.__next = null; };
BufferSourceNode.prototype.start = function () {
  if (!this.buffer) return;
  const gain = chainGain(this.__next || {});
  this.__voice = __cortexAudio.play(
    this.buffer.__id, this.loop ? 1 : 0, gain, this.playbackRate.value,
  );
  // registra a voz nos gains da cadeia (volume ao vivo — ex.: BGM)
  let current = this.__next;
  for (let i = 0; i < 8 && current; i++) {
    if (current.__voices) current.__voices.push(this.__voice);
    current = current.__next;
  }
};
BufferSourceNode.prototype.stop = function () {
  if (this.__voice) __cortexAudio.stop(this.__voice);
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
  };
  if (onLoad) onLoad(buffer);
  return Promise.resolve(buffer);
};

export function installWebAudioLite() {
  globalThis.AudioContext = AudioContextLite;
  globalThis.webkitAudioContext = AudioContextLite;
}
