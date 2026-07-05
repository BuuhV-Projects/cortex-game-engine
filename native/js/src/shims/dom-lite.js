// DOM-lite INERTE — deixa código de HUD/menu (createElement, appendChild,
// innerHTML, style) RODAR sem renderizar nada. Etapa 6a do M1: o jogo joga,
// a UI HTML fica invisível até a abstração de UI do engine (etapa 6b).
import { createEventBus } from './event-target.js';

function makeClassList() {
  const set = new Set();
  return {
    add(...names) { for (const n of names) set.add(n); },
    remove(...names) { for (const n of names) set.delete(n); },
    toggle(name) { set.has(name) ? set.delete(name) : set.add(name); },
    contains(name) { return set.has(name); },
  };
}

export function makeInertElement(tagName) {
  const bus = createEventBus();
  const element = {
    tagName: String(tagName || 'div').toUpperCase(),
    style: {},
    classList: makeClassList(),
    children: [],
    parentNode: null,
    innerHTML: '',
    textContent: '',
    id: '',
    className: '',
    hidden: false,
    appendChild(child) {
      element.children.push(child);
      if (child) child.parentNode = element;
      return child;
    },
    append(...nodes) { for (const n of nodes) element.appendChild(n); },
    removeChild(child) {
      const i = element.children.indexOf(child);
      if (i >= 0) element.children.splice(i, 1);
      return child;
    },
    remove() {
      if (element.parentNode) element.parentNode.removeChild(element);
    },
    setAttribute(name, value) { element[name] = value; },
    getAttribute(name) { return element[name] ?? null; },
    focus() {},
    blur() {},
    click() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
    addEventListener: bus.addEventListener,
    removeEventListener: bus.removeEventListener,
    dispatchEvent: bus.dispatchEvent,
  };
  return element;
}

export function installDomLite() {
  const documentBus = createEventBus();
  const body = makeInertElement('body');
  const head = makeInertElement('head');

  globalThis.document = {
    body,
    head,
    documentElement: makeInertElement('html'),
    createElement: makeInertElement,
    createElementNS(_ns, tag) { return makeInertElement(tag); },
    createTextNode(text) { return { textContent: text }; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener: documentBus.addEventListener,
    removeEventListener: documentBus.removeEventListener,
    dispatchEvent: documentBus.dispatchEvent,
  };

  // window === globalThis (como no browser), com event bus próprio —
  // o shim de input nativo despacha keydown/pointerdown aqui e no document.
  const windowBus = createEventBus();
  globalThis.window = globalThis;
  globalThis.addEventListener = windowBus.addEventListener;
  globalThis.removeEventListener = windowBus.removeEventListener;
  globalThis.dispatchEvent = windowBus.dispatchEvent;
  globalThis.innerWidth = globalThis.innerWidth || 1280;
  globalThis.innerHeight = globalThis.innerHeight || 720;
  globalThis.devicePixelRatio = 1;
}
