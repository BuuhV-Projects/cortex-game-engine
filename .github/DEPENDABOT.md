# Atualização de dependências

A configuração está em [`dependabot.yml`](dependabot.yml) e a decisão no
[TDR-0010](../docs/tdrs/0010-dependabot-atualiza-dependencias.md).

## Política

| Tipo | Frequência | Formato | O que fazer |
|---|---|---|---|
| **Vulnerabilidade** | imediato | PR individual | Tem prioridade sobre o trabalho em andamento |
| Patch | semanal | agrupado | Merge com CI verde e Greptile 5/5 |
| Minor | semanal | agrupado | Ler o changelog antes |
| **Major** | semanal | PR individual | Changelog lido; testar Studio e export nativo |
| Cargo / template | mensal | por pasta | Ver as seções abaixo |

O PR do Dependabot passa pelo mesmo portão de qualquer PR: CI verde e **Greptile 5/5** antes do
auto-merge. Atualizar é um ato deliberado.

## O que precisa ser ligado no repositório

Isso não é versionável: fica em **Settings → Code security**.

- [x] **Dependabot alerts**: é o que dispara o alerta de vulnerabilidade (ligado).
- [ ] **Dependabot security updates**: abre sozinho o PR de correção (desligado em 02/11/2026).

Sem os dois, este arquivo cobre só a atualização de rotina, e nada avisa sobre CVE.

## Casos que exigem cuidado

- **`rapier3d`** (`native/rapier-native`): o crate compila contra `patched/rapier3d` (0.22.0 com duas
  correções de desempenho, ADR-0336). Subir a versão exige reaplicar ou confirmar essas correções no
  upstream e rodar o `bench_idle_city`. Depois do merge, rode `yarn build:host`: o export recusa DLL mais
  velha que o crate (SPEC-0660).
- **`three`**: o renderer nativo porta o WGSL que o `three` gera (R1 do PRD-0466). Major ou minor do
  `three` exige rodar a paridade da galeria (`native/scripts/check-stage.sh`) com `&nativeRenderer=1` e a
  prova `&nativeTint=1`.
- **`templates/new-project`**: é o ponto de partida de todo jogo novo. Atualizar aqui não mexe nos jogos
  que já existem.

## Fora do Dependabot

Não vêm de um registro de pacotes, então ficam fora do radar dele:

| O quê | Onde | Como acompanhar |
|---|---|---|
| SDL3, wgpu-native, Hermes | `native/scripts/fetch-deps.ps1` | manual, ao mexer no host |
| Steamworks SDK | repo privado | `steam-sdk-watch.yml` abre issue |

## Pasta nova exige bloco novo

O Dependabot **não varre subpastas**. Uma pasta nova com `package.json` ou `Cargo.toml` precisa de um
bloco (ou de uma entrada em `directories`) no `dependabot.yml`. Sem isso, as dependências dela nunca
atualizam, e isso falha em silêncio.
