import { h } from './ui'
import { t } from './i18n'
import { formatSeconds, type RigClip } from './characterRigRegistry'
import { fileLabel } from './characterRigSelection'

/**
 * Linhas da lista de clipes da aba Animações (SPEC-0704): os clipes do rig (o mostrado em destaque, os que o GLB não
 * tem desligados, a marca de "gerar de novo") e os selecionados na config que ainda não estão no rig.
 */
export interface ClipListInput {
  clips: RigClip[]
  pending: Array<{ name: string; file: string }>
  /** Clipes do GLB carregado (vazio = ainda não carregou: nada fica desligado). */
  loaded: ReadonlySet<string> | ReadonlyMap<string, unknown>
  current: string | undefined
  needsRegen: (name: string) => boolean
  onPick: (name: string) => void
}

export function clipListRows(input: ClipListInput): HTMLElement[] {
  const loaded = input.loaded.size > 0
  const rows: HTMLElement[] = []
  for (const c of input.clips) {
    const absent = loaded && !input.loaded.has(c.name)
    const row = h('button', {
      type: 'button',
      class: `rig-clip${input.current === c.name ? ' on' : ''}${absent ? ' absent' : ''}`,
      title: c.file,
      onClick: () => input.onPick(c.name),
    },
    h('span', { class: 'rig-clip__name' }, c.name),
    h('span', { class: 'rig-clip__meta' }, `${formatSeconds(c.duration)}${c.loop ? ' · ⟳' : ''}`),
    h('span', { class: 'rig-clip__file' }, absent ? t('characterRig.anim.absent') : fileLabel(c.file)),
    ...(input.needsRegen(c.name) ? [h('span', { class: 'rig-clip__adj' }, t('characterRig.arm.regen_short'))] : []))
    ;(row as HTMLButtonElement).disabled = absent
    rows.push(row)
  }
  for (const p of input.pending) {
    rows.push(h('div', { class: 'rig-clip pending', title: t('characterRig.anim.pending_hint') },
      h('span', { class: 'rig-clip__name' }, p.name),
      h('span', { class: 'rig-clip__meta' }, t('characterRig.anim.pending')),
      h('span', { class: 'rig-clip__file' }, fileLabel(p.file))))
  }
  return rows
}
