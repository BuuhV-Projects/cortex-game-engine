// Globals básicos de browser: self, console (→ print nativo), performance.

export function installGlobals() {
  globalThis.self = globalThis;

  globalThis.console = {
    log: (...a) => print('[log]', ...a),
    info: (...a) => print('[info]', ...a),
    debug: (...a) => print('[debug]', ...a),
    warn: (...a) => print('[warn]', ...a),
    error: (...a) => print('[error]', ...a),
    trace: (...a) => print('[trace]', ...a),
  };

  globalThis.performance = globalThis.performance || { now: () => Date.now() };
}
