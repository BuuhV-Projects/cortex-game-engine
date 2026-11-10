/**
 * Confiança nos ganchos do projeto (SPEC-0724, adendo 1): gancho é código que roda no Blender, então o Studio pede
 * confirmação antes de rodar um que ainda não foi aceito. A impressão muda quando um gancho entra, sai ou muda.
 */
import { createHash } from 'crypto'
import { relative, resolve } from 'path'
import { fileSha } from './autoRigState.js'

export type HookLocale = 'en' | 'pt'

export interface HookDialogText {
  message: string
  detail: string
  /** [rodar, cancelar]: o índice 0 confirma. */
  buttons: [string, string]
}

const TEXT: Record<HookLocale, { message: string; intro: string; outro: string; run: string; cancel: string }> = {
  pt: {
    message: 'Rodar os ganchos do projeto no Blender?',
    intro: 'Este projeto traz código próprio para o auto-rig, que roda no Blender com o seu usuário:',
    outro: 'Rode só se você confia neste projeto. O Studio pergunta de novo se algum gancho mudar.',
    run: 'Rodar os ganchos',
    cancel: 'Cancelar',
  },
  en: {
    message: "Run the project's hooks in Blender?",
    intro: 'This project ships its own auto-rig code, which runs in Blender as your user:',
    outro: 'Only run it if you trust this project. The Studio asks again if any hook changes.',
    run: 'Run the hooks',
    cancel: 'Cancel',
  },
}

const toRel = (project: string, abs: string): string => relative(project, abs).replace(/\\/g, '/')

/** Chave do projeto em `trustedRigHooks`: o caminho absoluto, com `/`. */
export function trustKey(project: string): string {
  return resolve(project).replace(/\\/g, '/')
}

/** SHA-256 da lista de ganchos: caminho relativo e SHA-256 do conteúdo de cada um, na ordem da config. */
export function hooksFingerprint(project: string, hooks: string[]): string {
  const h = createHash('sha256')
  for (const abs of hooks) h.update(`${toRel(project, abs)}\0${fileSha(abs)}\n`)
  return h.digest('hex')
}

/** O projeto já aceitou exatamente estes ganchos? */
export function isHookTrusted(trusted: Record<string, string> | undefined, project: string, fingerprint: string): boolean {
  return trusted?.[trustKey(project)] === fingerprint
}

/** Texto do diálogo nativo no idioma das preferências (pt por padrão). */
export function hookDialogText(locale: HookLocale | undefined, project: string, hooks: string[]): HookDialogText {
  const t = TEXT[locale ?? 'pt']
  const list = hooks.map((abs) => `  • ${toRel(project, abs)}`).join('\n')
  return { message: t.message, detail: `${t.intro}\n\n${list}\n\n${t.outro}`, buttons: [t.run, t.cancel] }
}
