import { loadSave, saveAll } from '../utils/save'
import { DEFAULT_BINDING, buttonName, type GamepadBinding } from '../utils/inputBinding'
import { getGamepadManager, isAnyPadConnected } from '../utils/gamepad'
import { createMenuNav } from './menuNav'

interface ActionRow {
  key: keyof Pick<GamepadBinding, 'throttleButton' | 'brakeButton' | 'pauseButton'>
  label: string
  hint: string
}

const ACTIONS: ActionRow[] = [
  { key: 'throttleButton', label: 'Acelerar',  hint: 'Padrão: RT (gatilho direito)' },
  { key: 'brakeButton',    label: 'Frear/Ré',  hint: 'Padrão: LT (gatilho esquerdo)' },
  { key: 'pauseButton',    label: 'Pausa/Menu', hint: 'Padrão: Start' },
]

/**
 * Tela de configurações. Permite remapear botões do gamepad via captura
 * "press to bind": ao clicar em "Mudar", o jogo passa a fazer poll do
 * gamepad e atribui o primeiro botão pressionado à ação.
 *
 * Resolve quando o usuário fecha a tela.
 */
export function showSettings(): Promise<void> {
  return new Promise((resolve) => {
    const data = loadSave()
    let binding: GamepadBinding = { ...data.gamepadBinding }

    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <h1>⚙ CONFIGURAÇÕES</h1>
      <p>Remapeamento de botões do joystick Xbox. Teclado usa setas/WASD fixos.</p>
      <p style="margin-top:8px;font-size:13px;color:#9ad0ff;" id="pad-status"></p>

      <div class="player-panel" style="min-width:420px;max-width:520px;">
        <h2>Joystick</h2>
        <div id="actions"></div>

        <h3 style="margin-top:18px;">Direção (stick esquerdo)</h3>
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;">
          <input type="checkbox" id="invert" />
          <span>Inverter sentido (esquerda ⇄ direita)</span>
        </label>
      </div>

      <div class="btn-row">
        <button class="btn secondary nav-item" id="restore">RESTAURAR PADRÃO</button>
        <button class="btn nav-item" id="save">SALVAR E VOLTAR</button>
      </div>

      <p style="margin-top:24px;font-size:12px;color:#666;max-width:560px;text-align:center;">
        Dica: clique em "Mudar" e pressione o botão desejado no joystick. Pressione
        Esc no teclado para cancelar a captura.
      </p>
    `
    document.body.appendChild(overlay)

    const padStatus = overlay.querySelector<HTMLParagraphElement>('#pad-status')!
    const actionsEl = overlay.querySelector<HTMLDivElement>('#actions')!
    const invertEl  = overlay.querySelector<HTMLInputElement>('#invert')!
    invertEl.checked = binding.invertSteer
    invertEl.addEventListener('change', () => { binding.invertSteer = invertEl.checked })

    // ─── Renderização das linhas de ação ────────────────────────────────────
    const renderActions = () => {
      actionsEl.innerHTML = ''
      for (const a of ACTIONS) {
        const row = document.createElement('div')
        row.style.cssText =
          'display:flex;align-items:center;gap:10px;margin:8px 0;padding:8px;' +
          'background:#1d2940;border-radius:8px;'
        row.innerHTML = `
          <div style="flex:1;">
            <div style="font-weight:700">${a.label}</div>
            <div style="font-size:11px;opacity:.6">${a.hint}</div>
          </div>
          <div style="min-width:90px;text-align:center;padding:6px 10px;
                      background:#26365a;border-radius:6px;font-weight:700;color:#ffd23f;"
               data-current>${buttonName(binding[a.key])}</div>
          <button class="btn small nav-item" data-action="${a.key}">Mudar</button>
        `
        actionsEl.appendChild(row)
      }
      actionsEl.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const k = btn.dataset.action as ActionRow['key']
          nav.stop()
          captureButton().then((pressed) => {
            if (pressed !== null) {
              binding[k] = pressed
              renderActions()
            }
            nav.start()
          })
        })
      })
    }

    // ─── Status do gamepad — polling leve enquanto a tela está aberta ──────
    const gp = getGamepadManager()
    let alive = true
    const updateStatus = () => {
      if (!alive) return
      padStatus.textContent = isAnyPadConnected()
        ? '🎮 Joystick detectado e pronto.'
        : 'Nenhum joystick detectado — conecte um para usar esta tela.'
      requestAnimationFrame(updateStatus)
    }
    updateStatus()

    // ─── Captura: aguarda próximo botão pressionado em qualquer slot ───────
    function captureButton(): Promise<number | null> {
      const banner = document.createElement('div')
      banner.style.cssText =
        'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(16,20,28,.92);z-index:20;font-size:32px;color:#ffd23f;font-weight:900;' +
        'flex-direction:column;gap:16px;pointer-events:auto;'
      banner.innerHTML = `
        <div>Pressione um botão no joystick...</div>
        <div style="font-size:14px;color:#bbb;font-weight:400;">Esc para cancelar</div>
      `
      document.body.appendChild(banner)

      return new Promise((resolve) => {
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') finish(null)
        }
        document.addEventListener('keydown', onKey)

        // Snapshot do estado inicial dos botões para detectar transições
        gp.poll()
        const initial: boolean[][] = []
        for (let slot = 0; slot < 4; slot++) {
          const pad = gp.getGamepad(slot)
          initial.push(pad ? [...pad.buttons] : [])
        }

        const tick = () => {
          gp.poll()
          for (let slot = 0; slot < 4; slot++) {
            const pad = gp.getGamepad(slot)
            if (!pad) continue
            for (let b = 0; b < pad.buttons.length; b++) {
              const was = initial[slot][b] ?? false
              if (!was && pad.buttons[b]) { finish(b); return }
            }
          }
          if (alive && banner.isConnected) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)

        function finish(button: number | null) {
          document.removeEventListener('keydown', onKey)
          banner.remove()
          resolve(button)
        }
      })
    }

    // ─── Botões inferiores ──────────────────────────────────────────────────
    overlay.querySelector<HTMLButtonElement>('#restore')!.addEventListener('click', () => {
      binding = { ...DEFAULT_BINDING }
      invertEl.checked = binding.invertSteer
      renderActions()
    })
    overlay.querySelector<HTMLButtonElement>('#save')!.addEventListener('click', () => {
      data.gamepadBinding = binding
      saveAll(data)
      alive = false
      nav.stop()
      overlay.remove()
      resolve()
    })

    const nav = createMenuNav({
      items: () => Array.from(overlay.querySelectorAll<HTMLElement>('.nav-item')),
      onBack: () => {
        data.gamepadBinding = binding
        saveAll(data)
        alive = false
        nav.stop()
        overlay.remove()
        resolve()
      },
    })
    renderActions()
    nav.start()
  })
}
