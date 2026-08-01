# 0176 - Steamworks SDK vive num repo privado, entregue ao CI por deploy key

**Data:** 2026-07-31
**Status:** aceito

## Contexto

Depois da [ADR-0174](ADR-0174-appid-da-steam-como-dado-de-projeto.md), configurar
o app id virou trabalho de UI no Studio — mas **exportar** para a Steam ainda
exigia o repo do engine clonado na máquina. O motivo é o binário: o
`electron-builder` embarca apenas `native/build` (host desktop, TDR-0003), e o
`build-steam` fica de fora porque **o CI não consegue compilá-lo**.

E não consegue por uma razão dura: o `native/third_party/` é gitignored por
inteiro e o **Steamworks SDK está atrás de login de parceiro** — não há URL
pública para o `fetch-deps.ps1` baixar, como acontece com SDL3, wgpu-native e
basisu. Sem os headers (`public/steam/*.h`) e a `steam_api64.lib` o CMake nem
configura com `-DCORTEX_STEAM=ON`.

O resultado prático: o menu *Exportar › Steam* do Studio instalado erra pedindo
um host que nunca vai estar lá. Quem publica precisa do ambiente de dev completo
— exatamente o que a ADR-0174 tentou eliminar.

### Por que não commitar o SDK aqui

Foi a primeira ideia e está **descartada**: `BuuhV-Projects/cortex-game-engine` é
um repositório **público**. O Steamworks SDK Access Agreement permite
redistribuir os *redistributables* junto com o **seu jogo**, não publicar o SDK;
a Valve emite DMCA contra repositórios públicos que o hospedam. Pior, o conteúdo
sobreviveria no histórico do git mesmo depois de removido.

### Alternativas pesadas

- **Secret do Actions com o SDK em base64.** Secrets têm teto de ~48 KB; o SDK
  tem ~10 MB. Inviável.
- **Runner self-hosted** com o SDK instalado na máquina. Resolve, mas troca um
  problema de distribuição por um de infraestrutura permanente (manter, atualizar
  e proteger um runner só pra isso).
- **PAT de conta com acesso a um repo privado.** Funciona, e é o padrão mais
  comum. Descartada por escopo: um PAT clássico carrega acesso de *toda* a conta
  ou org; se vazar do CI, o estrago vai muito além do SDK.
- **Repo privado + deploy key read-only** (escolhida). A chave vale para **um
  repositório só** e **apenas para leitura** — o menor privilégio que resolve.
- **Tornar o engine privado.** Resolveria, mas muda a natureza do projeto por um
  detalhe de dependência.

## Decisão

**O Steamworks SDK passa a viver em `BuuhV-Projects/cortex-steamworks-sdk`
(privado), e o CI o obtém por uma deploy key read-only guardada como secret.**

1. **Conteúdo versionado lá**: só o necessário para compilar e linkar —
   `public/` (headers) e `redistributable_bin/win64/` (`steam_api64.lib` +
   `steam_api64.dll`). Exemplos, `glmgr/` e as ferramentas ficam de fora. O
   `Readme.txt` vai junto porque é o que identifica a **versão** do SDK.
2. **Chave**: par ed25519 gerado para este fim; a pública entra como *deploy key*
   (sem write) no repo do SDK, a privada como secret `STEAMWORKS_SDK_KEY` no repo
   do engine. Não é PAT e não dá acesso a mais nada.
3. **No CI** o SDK é feito checkout em `native/steamworks-sdk` e apontado pela
   env `STEAMWORKS_SDK`, que o CMake já aceita. Fica **fora** de
   `native/third_party/` de propósito: aquele caminho é cacheado pelo
   `actions/cache`, e o SDK entraria no cache sem necessidade.
4. **A versão do SDK é PINADA por tag**, como toda dep do repo ("nunca latest" é
   regra do `native/`). `native/steam/sdk-version.txt` guarda o número (`1.65`) e
   o checkout usa a tag `v<versão>` do repo do SDK. Seguir a `main` faria o host
   trocar de SDK sem ninguém decidir; assim, **atualizar é um commit** que bumpa
   esse arquivo — e esse commit, sendo `fix`/`feat`, já publica uma versão nova
   do engine pelo semantic-release.
5. **Um watcher avisa quando sai SDK novo.** O download não é automatizável (login
   de parceiro com 2FA, e automatizá-lo seria indevido), mas a **detecção** é: o
   grupo *Steamworks Development* publica um feed RSS **público** com os anúncios
   ("Steamworks SDK 1.65 has been released"). O workflow `steam-sdk-watch.yml`
   roda diário, compara com o `sdk-version.txt` e abre uma issue com o passo a
   passo. Uma issue por versão, não uma por dia.
6. **O host Steam passa a ser buildado no CI** (`native/build-steam`,
   `-DCORTEX_STEAM=ON`, clang-cl) e **embarcado no instalador**, ao lado do host
   desktop. O Studio instalado passa a exportar para a Steam.
7. **Fora do CI nada muda**: quem tem o SDK em `native/third_party/steamworks`
   (baixado do site, como sempre) segue buildando igual. O caminho continua
   gitignored no engine — o repo público nunca vê o SDK.
8. **Sem a secret o build não quebra.** Se `STEAMWORKS_SDK_KEY` não estiver
   configurada (fork, PR de terceiro), o passo do SDK é **pulado** e o CI produz
   um instalador **sem** o host Steam — como é hoje. Export PC e Xbox seguem
   intactos. Um build de release sem Steam é degradação aceitável; um CI vermelho
   em todo fork não é.

## Consequências

- **O Studio instalado passa a exportar para a Steam**, fechando o que a ADR-0174
  começou: app id pela UI *e* binário no instalador.
- **O instalador cresce** com um segundo `cortex_host.exe` (~6 MB) mais a
  `steam_api64.dll` (~320 KB). Aceitável perto dos ~200 MB do pacote atual.
- **O CI compila o host duas vezes** (desktop + Steam). O custo real é menor que o
  dobro: o Hermes upstream, que é a parte cara, tem cache por build dir — mas o
  primeiro build depois de mudar o CMake paga o preço inteiro nos dois.
- **Atualizar o SDK vira um fluxo de dois commits**: um no repo privado (com a
  tag `vX.YZ`) e outro no engine bumpando o `sdk-version.txt`. Perde-se o "está
  tudo num lugar só"; ganha-se conformidade com a licença e uma versão de SDK
  auditável no histórico do engine — dá pra saber com qual SDK cada release foi
  compilada sem abrir o repo privado.
- **O watcher depende de um formato de título da Valve** ("Steamworks SDK X.YZ
  has been released"). Se ela mudar a redação, o watcher silencia em vez de
  gritar — falha para o lado seguro, mas é um ponto a revisitar se um SDK novo
  passar batido. O parsing tem teste, então mudar a regra é barato.
- **Esquecer a tag no repo privado quebra o CI do engine** (checkout de ref
  inexistente). É barulhento e imediato, que é o comportamento desejado — melhor
  que compilar contra um SDK que ninguém escolheu.
- **A deploy key é um segredo a rotacionar.** Se vazar, dá leitura do SDK (que a
  Valve distribui a qualquer parceiro) e nada mais — o dano é contido por
  construção, mas a rotação continua sendo higiene.
- **Forks não conseguem gerar o host Steam.** É consequência direta da licença,
  não uma limitação que dê pra contornar.
