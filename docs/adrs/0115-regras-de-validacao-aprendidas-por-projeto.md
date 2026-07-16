# 0115 - Regras de validação aprendidas por projeto (validation-rules.json + save_rule)

**Data:** 2026-07-16
**Status:** aceito

## Contexto

O ADR-0113 declarou que o alvo preferencial do aprendizado por correções é
**código** ("threshold/regra do validate_scene, que nunca regride") — mas a
última milha não existia: os thresholds do `validateScene` eram parâmetros **por
chamada** (`maxGap`/`maxRise`) e as regras hardcoded no engine (que o agente,
rodando num projeto de jogo com bundle vendorizado, não pode editar). Na
prática, toda lição geométrica acabava como TEXTO no `.cortex/scene-learnings.md`
e dependia do LLM lembrar de passar o parâmetro na próxima chamada —
prompt-mediado, exatamente o que o 0113 queria superar.

Fechamos o loop pedido pelo dev: *dev pede → IA cria → IA testa → dev testa →
dev corrige → IA aprende → **ajusta o próprio código de criação e de teste***.

## Decisão

1. **`validateScene` configurável** (engine, API pública): novas opções
   `maxPenetration` (tolerância de interpenetração) e `severity`
   (override por regra: `error`/`warning`/`off`). As regras continuam no engine;
   o que muda por projeto é **dado**.
2. **`.cortex/validation-rules.json`** (`electron/agent/validationRules.ts`):
   destino durável das lições geométricas — `thresholds` + `severity` +
   `lessons` (trilha de auditoria: data, patch, motivo aprovado pelo dev,
   resultado da checagem). O **`validate_scene` carrega o arquivo
   automaticamente** como default (parâmetro explícito da chamada vence) — regra
   aprendida vale em TODA validação futura sem mediação de prompt.
3. **Tool `save_rule`** (server `cortex-learn`): grava uma lição geométrica
   aprovada como regra, com **checagem de regressão** embutida: reconstrói o
   estado do baseline como overlay sintético (`baselineOverlay` — replay do
   "antes" sem guardar a cena inteira) e valida antes × depois com a regra
   candidata. A regra só é gravada se **reprova o estado antigo e melhora o
   corrigido**; senão a tool recusa (a lição é gosto pontual → vira texto no
   scene-learnings.md; `force:true` exige pedido explícito do dev). Por isso a
   ordem no ciclo do 0113 importa: `save_rule` ANTES do `save_baseline` final
   (a checagem usa o baseline antigo como contraprova).
4. **Baseline ganha `url`** (`EffectiveNode.url`): permite reconstruir nós que o
   dev deletou no replay. Nós irreconstruíveis (attach estrutural, baselines
   antigos sem url) são reportados em `unreconstructed` — cobertura honesta.
5. **Conhecimento aprendido é versionado**: o `.gitignore` do template ignora
   `.cortex/*` mas **exceto** `validation-rules.json` e `scene-learnings.md`
   (cache/artefato fica fora; conhecimento vai pro git).
6. **Dois níveis de promoção**: o arquivo de regras é DO PROJETO (o pulo de cada
   jogo é diferente). Promover uma regra pra default do engine é decisão humana
   (ADR + teste unitário), nunca do agente.

## Consequências

- O ciclo do 0113 fecha em código: correção aprovada → regra determinística que
  o validador aplica sozinho → a IA itera contra a régua nova até 0 erros — o
  "código de criação" melhora indiretamente porque a Definição de Pronto passa
  pela régua endurecida.
- A checagem de regressão impede o risco clássico do self-modifying: lição ruim
  apertar um threshold e bloquear cena legítima sem evidência. O custo é que o
  replay é aproximado (usa os scenes/*.json ATUAIS + poses do baseline; se o
  agente editou o scene JSON depois do baseline, o "antes" é parcial) e não
  reproduz rotX/rotZ (baseline só guarda rotY).
- Overrides de `severity` valem pra regra inteira (ex.: `overlap` forçado a
  `error` perde a gradação warning/error por profundidade).
- Contra overfitting continuam valendo o veto do dev (0113) e a evidência do
  diff agregado (médias/tendência); a trilha `lessons` torna cada regra
  explicável e removível.
- Relaciona-se com: ADR-0112 (validador — as tolerâncias agora têm morada por
  projeto), ADR-0113 (o ciclo que alimenta isto), ADR-0089 (lean: regra como
  dado, não subsistema novo no engine).
