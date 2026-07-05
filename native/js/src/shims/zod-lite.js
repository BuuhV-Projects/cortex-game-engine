// zod-lite — substitui o zod NO HOST (bundle.mjs aponta o import pra cá).
// O engine usa zod só pra VALIDAR cena/level.json; no host a validação vira
// passthrough (o mesmo JSON já foi validado no Studio, que roda zod real).
// Um Proxy camaleão cobre qualquer superfície: todo método devolve outro
// schema-camaleão; parse/safeParse devolvem o valor como veio.

const schema = new Proxy(function () {}, {
  get(_target, prop) {
    if (prop === 'parse') return function (value) { return value; };
    if (prop === 'safeParse') {
      return function (value) { return { success: true, data: value }; };
    }
    if (prop === 'parseAsync' || prop === 'safeParseAsync') {
      return function (value) {
        return Promise.resolve(
          prop === 'parseAsync' ? value : { success: true, data: value },
        );
      };
    }
    if (prop === Symbol.toPrimitive || prop === 'toString') {
      return function () { return '[zod-lite]'; };
    }
    return function () { return schema; };
  },
  apply() { return schema; },
});

const z = new Proxy(function () {}, {
  get(_target, prop) {
    if (prop === 'z' || prop === 'default') return z;
    return function () { return schema; };
  },
  apply() { return schema; },
});

export default z;
export { z };
