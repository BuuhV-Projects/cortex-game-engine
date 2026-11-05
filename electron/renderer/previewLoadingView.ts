/**
 * Overlay do palco durante o carregamento do Play (SPEC-0694 e SPEC-0695): texto da
 * fase, barra com porcentagem estimada e, em `stalled`, o botão de reiniciar o
 * servidor. Só DOM; o estado vem de `previewLoading.ts` / `previewLoadingFlow.ts`.
 */
import { t } from './i18n'
import { h } from './ui'
import type { LoadingSnapshot } from './previewLoading'
import { MAX_AUTO_RETRIES, type LoadingKind } from './previewLoadingFlow'

const OVERLAY_CLASS = 'preview-loading'

/** Chaves de i18n por fase: [carregando, travado]. */
const TEXT_KEYS: Record<LoadingKind, readonly [string, string]> = {
  server: ['preview.loading_preparing', 'preview.loading_stalled'],
  scene: ['preview.loading_scene', 'preview.loading_scene_stalled'],
}

/** Redesenha o overlay sobre o `stage` conforme o snapshot (remove em `idle`). */
export function renderLoadingOverlay(
  stage: HTMLElement,
  snapshot: LoadingSnapshot,
  kind: LoadingKind,
  attempt: number,
  onRestart: () => void,
): void {
  stage.querySelector(`.${OVERLAY_CLASS}`)?.remove()
  if (snapshot.phase === 'idle') return

  const stalled = snapshot.phase === 'stalled'
  const [loadingKey, stalledKey] = TEXT_KEYS[kind]
  // Servidor reiniciado sozinho (SPEC-0696): mostra a tentativa em vez do texto normal.
  const text = kind === 'server' && !stalled && attempt > 0
    ? t('preview.loading_retrying', { n: attempt, max: MAX_AUTO_RETRIES })
    : t(stalled ? stalledKey : loadingKey)
  const box = h('div', { class: `${OVERLAY_CLASS}${stalled ? ' stalled' : ''}` },
    h('p', { class: 'preview-placeholder' }, text),
    h('div', { class: 'preview-loading-bar' },
      h('div', { class: 'fill', style: { width: `${snapshot.percent}%` } })),
    h('span', { class: 'preview-loading-percent mono' }, `${snapshot.percent}%`))
  if (stalled) {
    box.append(h('span', { class: 'vp-pill', style: { cursor: 'pointer' }, onClick: onRestart }, t('preview.loading_restart')))
  }
  stage.appendChild(box)
}
