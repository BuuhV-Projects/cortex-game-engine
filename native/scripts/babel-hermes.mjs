// Babel options of the export bundle (used by bundle.mjs and by its test).
import superReceiver from './babel-super-receiver.mjs';

/** @param {string} cwd plugin resolution root (the engine) */
export function hermesBabelOptions(cwd) {
  return {
    // Classes E arrows no MESMO passe do Babel: se o esbuild rebaixar arrows
    // antes, ele iça `var _this = this` pro topo de constructors de subclasse
    // e o transform de classes acusa `this` antes do super(). loose: herança
    // por protótipo direto, sem Reflect.construct (modo spec quebra no Hermes).
    // Arrows precisam ser rebaixadas porque o Hermes não tem async arrow.
    plugins: [
      // ANTES do transform-classes: leitura `super.x` com o receptor certo (ADR-0465).
      superReceiver,
      ['@babel/plugin-transform-classes', { loose: true }],
      '@babel/plugin-transform-arrow-functions',
      // ⚠️ OBRIGATÓRIO: o Hermes NÃO implementa o binding POR ITERAÇÃO do `let` em
      // loop. Uma closure criada dentro de `for (let i…)` enxerga o valor FINAL de
      // `i`, não o da sua iteração (provado no host: `for (let k=0;k<3;k++)
      // probes.push(() => k)` devolve `3,3,3` em vez de `0,1,2`). Isso corrompe
      // silenciosamente QUALQUER código com closure em loop — nosso, do jogo ou de
      // dependência. Foi o que apagou a iluminação no export: o CSM do three indexa
      // `this._shadowNodes[i]` dentro de um callback e recebia `[4]` → `undefined`.
      // O Babel gera a captura correta, então o transform CONSERTA o Hermes aqui.
      // Ver ADR-0146.
      '@babel/plugin-transform-block-scoping',
    ],
    cwd, // resolução dos plugins independe do cwd do chamador
    compact: true,
    babelrc: false,
    configFile: false,
  };
}
