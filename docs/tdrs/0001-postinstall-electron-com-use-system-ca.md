# TDR 0001 - `postinstall` força download do Electron via system CA

**Data:** 2026-05-26
**Status:** aceito

## Contexto

O pacote `electron` no npm é um stub leve. O binário real (≈ 100 MB) é
baixado em `node_modules/electron/dist/` pelo script `install.js` que
roda como `postinstall` no próprio pacote durante `yarn install`. Em
máquinas sob proxy/antivírus que faz MITM (Zscaler, Kaspersky, ESET),
esse download falha com `UNABLE_TO_VERIFY_LEAF_SIGNATURE` — o cert que o
MITM injeta está no certificado de **sistema** do Windows, mas o Node
usa um bundle interno e não enxerga o cert injetado.

Quando o download falha, o `install.js` do `electron` engole o erro
silenciosamente (não rejeita o `yarn install`). O `node_modules/electron/`
fica sem `dist/`, e qualquer tentativa de rodar `electron-vite dev`
explode com `Error: Electron uninstall`. Já aconteceu duas vezes nessa
sessão.

## Decisão

Adicionar um script `postinstall` no `package.json` que **força** o
download do binário do Electron usando os certs do sistema operacional:

```json
"postinstall": "node --use-system-ca node_modules/electron/install.js"
```

A flag `--use-system-ca` (disponível no Node ≥ 22.0.0) instrui o
runtime a também confiar nos certs do Windows Certificate Store —
onde o root do MITM corporativo costuma estar instalado. O download
em si é verificado por SHA-256 contra `checksums.json` do pacote, então
não há perda de integridade.

Também é exposto o script manual `yarn electron:install` para o caso
de o usuário precisar re-rodar sem reinstalar tudo (ex.: o binário foi
apagado por engano).

## Consequências

- Após `yarn install`, o binário é sempre baixado mesmo em redes com
  MITM. Sem isso, o usuário precisaria saber o comando manual com a
  flag — friction desnecessário.
- Requer Node ≥ 22 (que já é a versão atual do projeto — `engines.node
  >= 18` no `package.json` é folgada o suficiente).
- Em máquinas sem MITM, `--use-system-ca` é um no-op funcional — adiciona
  CAs do sistema às já confiadas; download continua normal.
- Se um dia o stub `electron` mudar o caminho do `install.js` ou o nome
  do binário emitido, este TDR fica desatualizado — o script é o ponto
  de manutenção único.
