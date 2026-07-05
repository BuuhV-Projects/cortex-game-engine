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
