/**
 * Overlay do palco durante o carregamento do Play (SPEC-0694): texto da fase,
 * barra com porcentagem estimada e, em `stalled`, o botão de reiniciar o servidor.
 * Só DOM; o estado vem de `previewLoading.ts`.
 */
import { t } from './i18n'
import { h } from './ui'
import type { LoadingSnapshot } from './previewLoading'

const OVERLAY_CLASS = 'preview-loading'

/** Redesenha o overlay sobre o `stage` conforme o snapshot (remove em `idle`). */
export function renderLoadingOverlay(stage: HTMLElement, snapshot: LoadingSnapshot, onRestart: () => void): void {
  stage.querySelector(`.${OVERLAY_CLASS}`)?.remove()
  if (snapshot.phase === 'idle') return

  const stalled = snapshot.phase === 'stalled'
  const box = h('div', { class: `${OVERLAY_CLASS}${stalled ? ' stalled' : ''}` },
    h('p', { class: 'preview-placeholder' }, t(stalled ? 'preview.loading_stalled' : 'preview.loading_preparing')),
    h('div', { class: 'preview-loading-bar' },
      h('div', { class: 'fill', style: { width: `${snapshot.percent}%` } })),
    h('span', { class: 'preview-loading-percent mono' }, `${snapshot.percent}%`))
  if (stalled) {
    box.append(h('span', { class: 'vp-pill', style: { cursor: 'pointer' }, onClick: onRestart }, t('preview.loading_restart')))
  }
  stage.appendChild(box)
}
