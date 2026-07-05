// EventTarget-lite + Event/CustomEvent — o "DOM" que os jogos realmente
// usam como barramento (document.dispatchEvent(new CustomEvent('rush:*'))).
// Sem árvore, sem bubbling: listeners por tipo, chamada síncrona.

export function createEventBus() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      if (typeof callback !== 'function') return;
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(callback);
    },
    removeEventListener(type, callback) {
      const list = listeners.get(type);
      if (!list) return;
      const index = list.indexOf(callback);
      if (index >= 0) list.splice(index, 1);
    },
    dispatchEvent(event) {
      const list = listeners.get(event.type);
      if (list) {
        for (const callback of list.slice()) {
          try {
            callback(event);
          } catch (e) {
            print('[events] listener de "' + event.type + '" lançou: ' + e);
          }
        }
      }
      return true;
    },
  };
}

// Classe EventTarget (o three/engine estendem — EventDispatcher etc.).
function EventTargetClass() {
  const bus = createEventBus();
  this.addEventListener = bus.addEventListener;
  this.removeEventListener = bus.removeEventListener;
  this.dispatchEvent = bus.dispatchEvent;
}

export function installEventClasses() {
  globalThis.EventTarget = EventTargetClass;
  function Event(type, init) {
    this.type = type;
    this.bubbles = !!(init && init.bubbles);
    this.cancelable = !!(init && init.cancelable);
    this.defaultPrevented = false;
  }
  Event.prototype.preventDefault = function () {
    this.defaultPrevented = true;
  };
  Event.prototype.stopPropagation = function () {};

  function CustomEvent(type, init) {
    Event.call(this, type, init);
    this.detail = init ? init.detail : undefined;
  }
  CustomEvent.prototype = Object.create(Event.prototype);

  globalThis.Event = Event;
  globalThis.CustomEvent = CustomEvent;
}
