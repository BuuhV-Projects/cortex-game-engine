# scripts/ — comportamentos anexáveis (estilo MonoBehaviour)

Cada arquivo aqui exporta **uma** subclasse de `ScriptBehavior` (ADR-0085).
Todos são **auto-registrados** no boot (`registerScripts` + glob no `main.ts`):

- O nome no Inspector ("Adicionar Componente → Script") é o **nome do
  arquivo** — `Girar.ts` vira `Girar` (estilo Unity).
- Quer outro nome (ex.: em português, ou renomeou o arquivo sem quebrar cenas
  salvas)? Declare `static scriptName = 'MeuNome'` na classe.
- ⚠️ O nome é **persistido** nas cenas (`level.json` / `scene-data.json`) —
  renomear arquivo/scriptName depois exige atualizar as cenas que o usam.

Campos editáveis no Inspector: declare em `static fields` (number, string,
boolean, vector3, asset, select) — os valores aplicam **ao vivo**.

Hooks: `onStart()` (1º frame de Play), `onUpdate(dt)` (todo frame de Play),
`onDestroy()` (remoção). Handles do engine em `this.ctx` (world, input,
gamepad, scene, camera); o objeto anexado em `this.object3d`.

## Hot reload (ADR-0698)

Salvar um script troca o comportamento **ao vivo**, no Play ou fora dele, sem
recarregar a página: as instâncias vivas passam a usar a classe nova e
**mantêm o estado** (timers, referências, valores do Inspector). O `onStart`
não roda de novo. Para isso o arquivo cumpre um contrato:

- **Só exporta subclasses de `ScriptBehavior`.** Exportou função, const ou
  outra classe → a página recarrega inteira, como antes. Tipos podem.
- **O topo do módulo não tem efeito colateral.** Ele roda de novo a cada save:
  listener de `document`, `globalThis.__x` ou cache de módulo duplicariam.
  Ponha no `onStart` e desfaça no `onDestroy`.
- Campo novo nasce com o valor do inicializador; se estiver no
  `static fields`, com o valor da cena ou do Inspector, senão o `default`
  do schema (a mesma regra da criação no Play).
- **Estado privado com `private` do TypeScript, não `#campo`.** O `#campo`
  nativo não sobrevive à troca de classe: arquivo com `#` recarrega a página.
- **Script que é base de outro arquivo** (`class Zumbi extends InimigoBase`)
  recarrega a página ao salvar — a derivada ficaria com a base velha.
- Mudou a forma do estado e o valor antigo não serve mais? Implemente
  `onHotReload()`: roda na instância viva logo depois da troca (pode, por
  exemplo, chamar `this.onDestroy()` e `this.onStart()`).

Criar ou apagar um arquivo aqui ainda recarrega a página.
