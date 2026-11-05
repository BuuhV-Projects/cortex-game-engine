/**
 * Registra os web workers do Monaco no `MonacoEnvironment`.
 *
 * O Monaco roda parser, diagnóstico e formatação fora da thread principal: um
 * worker base (`editor.worker`) mais um por família de linguagem. Sem eles o
 * editor abre, mas perde IntelliSense, erro sublinhado e formatação.
 *
 * Os workers são importados com o sufixo `?worker` do Vite, que empacota cada
 * entrypoint como chunk e devolve um construtor de `Worker` — em dev e no
 * empacotado. Antes isso era feito pelo `vite-plugin-monaco-editor` (ADR-0690).
 */
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'

/**
 * Aponta o `MonacoEnvironment` para os workers empacotados pelo Vite.
 *
 * Os labels são os que o Monaco passa por linguagem; qualquer outro
 * (`markdown`, `plaintext`) cai no worker base, que é o comportamento esperado.
 * Idempotente: chamar duas vezes só reescreve o mesmo objeto.
 */
export function registerMonacoWorkers(): void {
  self.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      if (label === 'typescript' || label === 'javascript') return new tsWorker()
      if (label === 'json') return new jsonWorker()
      if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
      if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
      return new editorWorker()
    },
  }
}
