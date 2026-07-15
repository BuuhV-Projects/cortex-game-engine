# Checklist de validação de cena

Duas etapas, NESTA ordem — geometria se valida com código; olho é pra beleza.

## Etapa 1 — Geometria por código (`validate_scene`, até 0 erros)

- [ ] Rodou `validate_scene` depois de TODA escrita/edição de `scenes/*.json`?
- [ ] 0 erros: sem `overlap` (interpenetração), `floating` (peça sem apoio),
      `tilted` (gameplay tombado), `attach` quebrado.
- [ ] Warnings revisados: `misaligned` (chão fora de 90°), `gap`/`rise`
      (vão/subida além do pulo), `floating` de plataforma (intencional?).
- [ ] `stats.skipped` vazio ou justificado (peça fora de kit não é validada —
      prefira peças com entrada no `kit.json`).
- [ ] Conexões declaradas por `attach` (socket) em vez de coordenada chutada,
      onde o kit oferece âncoras.

## Etapa 2 — Visual (só com a geometria limpa)

- [ ] `playtest_game` com close-ups região por região (nunca só foto wide);
      jogou o level de ponta a ponta (gaps puláveis DE VERDADE).
- [ ] `critique_scene` contra a referência/mood — composição, paleta, ritmo,
      leitura (hazard visível, coin/checkpoint com destaque).
- [ ] Curva de tensão: intro calma e decorada → clímax austero → resolução segura.

## Fechamento

- [ ] `save_baseline { fase }` (ciclo de aprendizado — ADR-0113).
- [ ] Lições novas → `.cortex/scene-learnings.md` (deduplicadas).
- [ ] Defeito que escapou pro playtest → propor REGRA nova no validate_scene
      (nunca só conserto pontual).
