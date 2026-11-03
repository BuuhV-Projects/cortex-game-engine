# 0010 - Dependabot vigia as dependências (yarn, Cargo, Actions)

**Data:** 2026-11-02
**Status:** aceito

## Contexto

O repo crava todas as versões (`yarn add -E`, nunca `latest`), o que deixa o build reproduzível, mas
também cria a obrigação de revisitá-las. Nada avisava quando uma dependência envelhecia. Em 02/11, os
carros estacionados do DDD 00 sumiam só no export porque a `rapier_native.dll` estava mais velha que
o shim. Isso é "binário desatualizado", não "dependência desatualizada", e foi corrigido no export
(SPEC-0660), mas expôs a falta de um monitor de versões. O monorepo da Music Branding Platform já usa
Dependabot com essa política (ADR-0024 de lá).

Alternativas consideradas:

- **Renovate**: mais configurável, mas exige app ou workflow próprio e tem mais superfície para
  configurar e manter. O Dependabot é nativo do GitHub e cobre os três ecossistemas do repo.
- **Workflow próprio** (como o `steam-sdk-watch.yml`): faz sentido só onde não há registro de
  pacotes, como o Steamworks SDK atrás de login de parceiro.

## Decisão

`.github/dependabot.yml`, com a política descrita em `.github/DEPENDABOT.md`:

- **npm/yarn**: a raiz, `web/` e `native/export-toolchain/` toda semana. `templates/new-project/`
  (o que vira jogo novo) todo mês. `versioning-strategy: increase` mantém as versões cravadas.
- **Cargo**: `native/rapier-native` e o `src-tauri` do template, todo mês. Subir o `rapier3d` exige
  reaplicar o patch de `native/rapier-native/patched/` (ADR-0336).
- **GitHub Actions**: os workflows e as actions compostas de `.github/actions/*`, toda semana.
- Patch e minor vão **agrupados** (um PR por dependência vira ruído, e ruído leva a ignorar). Major
  vai em **PR individual**.
- O PR do Dependabot segue o mesmo portão de qualquer PR: CI verde e Claude review 5/5 antes do auto-merge (TDR-0011; era Greptile).

Fica fora do Dependabot, porque não vem de um registro de pacotes: SDL3, wgpu-native e Hermes
(`native/scripts/fetch-deps.ps1`) e o Steamworks SDK (que tem o `steam-sdk-watch.yml`).

## Consequências

- Até 5 PRs semanais por ecossistema. O agrupamento deixa a maioria em um PR por semana.
- Pasta nova com `package.json` ou `Cargo.toml` exige um bloco novo no `dependabot.yml`: o Dependabot
  não varre subpastas, e a pasta esquecida envelhece em silêncio.
- Alerta de vulnerabilidade depende das configurações do repositório (Dependabot alerts e security
  updates), não deste arquivo.
