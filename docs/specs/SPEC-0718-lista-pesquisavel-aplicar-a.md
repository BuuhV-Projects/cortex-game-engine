# SPEC-0718 - Lista pesquisável no "Aplicar a: Selecionados"

**Data:** 2026-11-09
**Status:** implementado
**Relacionado:** SPEC-0708, ADR-0707

## Contexto

No ajuste de pose do Auto-rig, "Aplicar a" → "Selecionados" (SPEC-0708) mostrava as caixas do player e dos NPCs
(LUC-01, npc-001 … npc-136) num bloco corrido, sem estilo: o nome quebrava no meio ("npc-" numa linha, "003" na
outra) e não dava para saber qual caixa era de qual personagem. Com mais de cem NPCs, também não havia como achar um
código, e a lista empurrava "Aplicar a todos os clipes" e "Salvar pose" para fora da tela.

## Decisão

A lista de "Selecionados" vira uma lista de um item por linha:

- **Linha**: caixa + código juntos (`white-space: nowrap`), a linha inteira é clicável (um `<label>`).
- **Busca** no topo: filtra pelo código, sem diferenciar maiúsculas ("110" acha `npc-110`; "npc-13" acha
  `npc-130`…`npc-136`).
- **Seleção à parte**: os marcados ficam num `Set` do `RigApplyTo`, não nas caixas; filtrar, limpar a busca ou
  redesenhar a lista não perde marcação. Vale também o que está marcado e escondido pelo filtro.
- **Marcados no topo**: a lista mostra primeiro os marcados (na ordem da config), depois os demais.
- **"Só marcados"**: caixa que esconde os não marcados.
- **Contagem**: "N marcados".
- **"Marcar visíveis"** marca o que o filtro mostra; **"Limpar"** desmarca todos.
- **Rolagem própria**: a lista tem altura máxima (~220 px) e rola sozinha; os botões do rodapé não saem da tela.

O que vai para "Salvar pose" e "Aplicar a todos os clipes" não muda: os alvos são os códigos do `Set` (inclusive os
escondidos pelo filtro), passados ao `applyTargets` como antes. A seleção inicial continua sendo quem se edita.

## Implementação

- `characterRigCharacters.ts`: `visibleApplyCodes(codes, query, checked, onlyChecked)` (filtro + marcados no topo,
  função pura).
- `RigApplyTo.ts`: busca, contagem, botões, `Set` de marcados e redesenho da lista a partir dele.
- `styles.css`: `.rig-apply*` (lista em coluna, altura máxima, rolagem, item sem quebra).
- `i18n/pt.json` (+ `en.json`): textos novos em `characterRig.apply`.

## Aceite

1. Teste de `visibleApplyCodes`: filtro por trecho do código, sem caixa; marcados no topo; "só marcados".
2. No Studio: buscar "13", marcar `npc-135` e `npc-136`, limpar a busca: os dois seguem marcados, no topo, e a
   contagem diz "2 marcados" (mais quem se edita).
