// Audio / HTMLAudioElement over the native audio (__cortexAudio) — SPEC-0392.
// Only the media-element subset games use: src, play/pause, volume, muted,
// loop, preload and the 'ended'/'error' events. The track is fetched and
// decoded whole on play() and freed when the src changes (ADR-0153).
// ponytail: play() after pause() restarts the track (native voices have no
// start offset); add an offset argument to __cortexAudio.play if a game needs it.
import { createEventBus } from './event-target.js';

const MS_PER_SECOND = 1000;

function domError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function AudioElement(url) {
  const bus = createEventBus();
  this.addEventListener = bus.addEventListener;
  this.removeEventListener = bus.removeEventListener;
  this.dispatchEvent = bus.dispatchEvent;
  this.preload = 'auto';
  this.loop = false;
  this.paused = true;
  this.ended = false;
  this.__src = '';
  this.__volume = 1;
  this.__muted = false;
  this.__bufferId = 0;
  this.__voice = 0;
  this.__endTimer = 0;
  this.__generation = 0;
  this.__pending = null;
  if (url) this.src = url;
}

AudioElement.prototype.__gain = function () {
  return this.__muted ? 0 : this.__volume;
};

// Stops playback and invalidates a pending play() (it rejects with AbortError).
AudioElement.prototype.__stopVoice = function () {
  this.__generation++;
  this.__pending = null;
  if (this.__voice) __cortexAudio.stop(this.__voice);
  if (this.__endTimer) clearTimeout(this.__endTimer);
  this.__voice = 0;
  this.__endTimer = 0;
};

// Media element load algorithm: drop playback, the decoded track and any
// pending play().
AudioElement.prototype.load = function () {
  this.__stopVoice();
  if (this.__bufferId) __cortexAudio.free(this.__bufferId);
  this.__bufferId = 0;
  this.paused = true;
  this.ended = false;
};

Object.defineProperty(AudioElement.prototype, 'src', {
  get() { return this.__src; },
  set(value) {
    this.__src = String(value);
    this.load();
  },
});

AudioElement.prototype.getAttribute = function (name) {
  return name === 'src' && this.__src ? this.__src : null;
};

AudioElement.prototype.removeAttribute = function (name) {
  if (name !== 'src') return;
  this.__src = '';
  this.load();
};

Object.defineProperty(AudioElement.prototype, 'volume', {
  get() { return this.__volume; },
  set(value) {
    this.__volume = value;
    if (this.__voice) __cortexAudio.setGain(this.__voice, this.__gain());
  },
});

Object.defineProperty(AudioElement.prototype, 'muted', {
  get() { return this.__muted; },
  set(value) {
    this.__muted = !!value;
    if (this.__voice) __cortexAudio.setGain(this.__voice, this.__gain());
  },
});

AudioElement.prototype.__decode = function (generation) {
  if (this.__bufferId) return Promise.resolve(this.__duration);
  return fetch(this.__src)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .then((bytes) => {
      const decoded = bytes ? __cortexAudio.decode(bytes) : null;
      if (!decoded) return null;
      // Stopped or re-sourced while loading: this PCM belongs to nobody.
      if (generation !== this.__generation) {
        __cortexAudio.free(decoded.id);
        return null;
      }
      this.__bufferId = decoded.id;
      this.__duration = decoded.duration;
      return decoded.duration;
    });
};

AudioElement.prototype.play = function () {
  if (!this.__src) {
    return Promise.reject(domError('NotSupportedError', 'Audio.play: no src'));
  }
  if (this.__voice) return Promise.resolve();
  if (this.__pending) return this.__pending;
  const generation = this.__generation;
  this.paused = false;
  this.ended = false;
  this.__pending = this.__decode(generation).then((duration) => {
    if (generation !== this.__generation) {
      throw domError('AbortError', 'Audio.play: interrupted');
    }
    this.__pending = null;
    if (duration === null) {
      this.paused = true;
      this.dispatchEvent(new Event('error'));
      throw domError('NotSupportedError', 'Audio.play: cannot decode ' + this.__src);
    }
    this.__voice = __cortexAudio.play(this.__bufferId, this.loop ? 1 : 0, this.__gain(), 1);
    if (!this.loop) {
      this.__endTimer = setTimeout(() => {
        this.__voice = 0;
        this.__endTimer = 0;
        this.paused = true;
        this.ended = true;
        this.dispatchEvent(new Event('ended'));
      }, duration * MS_PER_SECOND);
    }
  });
  return this.__pending;
};

AudioElement.prototype.pause = function () {
  this.__stopVoice();
  this.paused = true;
};

export function installHtmlAudio() {
  globalThis.Audio = AudioElement;
  globalThis.HTMLAudioElement = AudioElement;
}
