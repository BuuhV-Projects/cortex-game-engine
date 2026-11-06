// Audio / HTMLAudioElement over the native audio (__cortexAudio) — SPEC-0392.
// Only the media-element subset games use: src, play/pause, volume, muted,
// loop, preload and the 'ended'/'error' events. The track is fetched and
// decoded whole on play() and freed when the src changes (ADR-0153).
// pause() keeps the played position and play() resumes from it (SPEC-0700).
// ponytail: position by wall clock, not by samples the host consumed — device
// latency (tens of ms) leaks into the resume; query the host if a game needs it.
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
  this.__duration = 0;
  /** Seconds into the track playback starts/resumes at. */
  this.__position = 0;
  /** performance.now() when the live voice started (from `__position`). */
  this.__startedAt = 0;
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
  this.__position = 0;
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

/** Position now: the stored one plus the time the live voice has played. */
AudioElement.prototype.__playedPosition = function () {
  if (!this.__voice) return this.__position;
  const position = this.__position + (performance.now() - this.__startedAt) / MS_PER_SECOND;
  if (!this.__duration) return position;
  return this.loop ? position % this.__duration : Math.min(position, this.__duration);
};

Object.defineProperty(AudioElement.prototype, 'duration', {
  get() { return this.__bufferId ? this.__duration : NaN; },
});

Object.defineProperty(AudioElement.prototype, 'currentTime', {
  get() { return this.__playedPosition(); },
  set(value) {
    const playing = !!this.__voice;
    this.__stopVoice();
    this.__position = Math.max(Number(value) || 0, 0);
    this.ended = false;
    if (playing) this.__startVoice();
  },
});

// Native voice from `__position`; a one-shot schedules `ended` for what is left.
AudioElement.prototype.__startVoice = function () {
  if (this.__duration && this.__position >= this.__duration) this.__position = this.loop ? this.__position % this.__duration : this.__duration;
  this.__voice = __cortexAudio.play(this.__bufferId, this.loop ? 1 : 0, this.__gain(), 1, this.__position);
  this.__startedAt = performance.now();
  if (this.loop) return;
  this.__endTimer = setTimeout(() => {
    this.__voice = 0;
    this.__endTimer = 0;
    this.__position = 0;
    this.paused = true;
    this.ended = true;
    this.dispatchEvent(new Event('ended'));
  }, (this.__duration - this.__position) * MS_PER_SECOND);
};

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
    this.__startVoice();
  });
  return this.__pending;
};

AudioElement.prototype.pause = function () {
  this.__position = this.__playedPosition();
  this.__stopVoice();
  this.paused = true;
};

export function installHtmlAudio() {
  globalThis.Audio = AudioElement;
  globalThis.HTMLAudioElement = AudioElement;
}
