/**
 * Identidade do aplicativo — fonte única do nome do Studio (SPEC-0179).
 *
 * Módulo puro de propósito (só constantes, zero import do `electron`): é
 * consumido pelo processo **main** (splash de boot, `app.setName`) e também
 * pelo **renderer** (launcher, boas-vindas), que roda em outro bundle.
 */

/**
 * Nome exibido ao usuário. Único lugar a mudar num rebrand — a splash, o
 * launcher e o modal de boas-vindas leem daqui.
 *
 * Fora do TS, o mesmo nome aparece como literal em três arquivos de dado (que
 * não podem importar este módulo) e precisa ser trocado junto:
 * `electron-builder.json` (`productName`), `electron/renderer/i18n/pt.json` e
 * `en.json` (`welcome.title`). O teste `appIdentity.test.ts` trava esse
 * casamento.
 */
export const APP_DISPLAY_NAME = 'TS Cortex Studio'

/**
 * Wordmark curto, para as faixas de 30px onde o nome completo não cabe: a marca
 * da menubar (`Shell`) e a titlebar da tela inicial (`Launcher`). Minúsculo por
 * estilo, acompanhando o desenho que já existia.
 */
export const APP_WORDMARK = 'ts cortex'

/**
 * Identidade de DADOS — **congelada**, não é nome de exibição.
 *
 * O Electron deriva o `userData` do nome do app, e no build empacotado esse
 * nome vem do `productName` do electron-builder. Sem travar isso, cada rebrand
 * moveria `%APPDATA%\<nome>` e abandonaria o estado do usuário: `preferences.json`
 * (idioma, welcome, último projeto), `chats/` e `sessions/` (histórico do Chat IA).
 *
 * Por isso o `main.ts` fixa o diretório no boot — `app.setPath('userData', …)`
 * com este nome —, ANTES do primeiro `app.getPath('userData')`. O valor é o nome
 * antigo do produto: é chave de compatibilidade, não marca. **Nunca** atualize
 * para acompanhar o `APP_DISPLAY_NAME`; mudá-lo faz o Studio perder os dados de
 * quem já o usa.
 */
export const APP_DATA_NAME = 'Cortex Game Engine Studio'
