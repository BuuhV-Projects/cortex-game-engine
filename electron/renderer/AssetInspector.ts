import { h, icon } from './ui'

interface GlbAsset {
  name: string
  sizeBytes: number
  meshes: number
  materials: number
  animations: number
  triangles: number
}

/**
 * Painel "Asset · GLB" do dock direito (redesign Layout A): aparece **sobre** o
 * inspector quando um `.glb` está aberto (evento `glb-asset` do {@link GlbPreview}),
 * mostrando só o **conteúdo real** do asset (malhas/materiais/animações/triângulos)
 * — sem settings de importação que não existem ainda. Some no `glb-asset-close`.
 */
export class AssetInspector {
  private host: HTMLElement
  private overlay!: HTMLElement

  constructor(host: HTMLElement) {
    this.host = host
  }

  /** Chame DEPOIS do EditorPanels.init() — ele faz innerHTML='' no mesmo host. */
  init(): void {
    this.overlay = h('div', { class: 'panel inspector-dock asset-inspector', style: { display: 'none' } })
    this.host.appendChild(this.overlay)
    document.addEventListener('glb-asset', (e) => this.show((e as CustomEvent<GlbAsset>).detail))
    document.addEventListener('glb-asset-close', () => this.hide())
    document.addEventListener('project-close', () => this.hide())
    // Trocar pra Cena/código esconde o Asset (o glb fica aberto, só não está ativo).
    document.addEventListener('editor-doc-change', (e) => {
      if ((e as CustomEvent<{ kind: string }>).detail.kind !== 'glb') this.hide()
    })
  }

  private hide(): void {
    this.overlay.style.display = 'none'
  }

  private show(a: GlbAsset): void {
    const kv = (k: string, v: string | Node): HTMLElement =>
      h('div', { class: 'kv' }, h('span', { class: 'k' }, k), typeof v === 'string' ? h('span', { class: 'v' }, v) : v)

    this.overlay.textContent = ''
    this.overlay.append(
      h('div', { class: 'panel-h' },
        h('span', { class: 'ico', style: { color: 'var(--tx-lo)' } }, icon('cube', { size: 14 })),
        h('span', { class: 'ttl lit' }, 'Asset · GLB'),
      ),
      h('div', { class: 'insp scroll grow' },
        h('div', { class: 'insp-id' },
          h('span', { class: 'chip', style: { borderRadius: '8px', fontFamily: 'var(--mono)', fontWeight: '800', fontSize: '11px' } }, '3D'),
          h('div', { class: 'col', style: { gap: '2px' } },
            h('span', { class: 'nm' }, a.name),
            h('span', { class: 'sub' }, `glTF binary · ${fmtSize(a.sizeBytes)}`),
          ),
        ),
        h('div', { class: 'sec', style: { borderBottom: 'none' } },
          h('div', { class: 'sec-h' }, icon('chevD', { size: 12 }), h('span', { class: 'lbl' }, 'Conteúdo')),
          h('div', { class: 'sec-b' },
            kv('Malhas', String(a.meshes)),
            kv('Materiais', String(a.materials)),
            kv('Animações', String(a.animations)),
            kv('Triângulos', a.triangles.toLocaleString('pt-BR')),
          ),
        ),
      ),
    )
    this.overlay.style.display = 'flex'
  }
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}
