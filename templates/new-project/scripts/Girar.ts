/**
 * Script de exemplo (anexável — ADR-0085): gira o objeto no eixo Y.
 *
 * Todo arquivo desta pasta é **auto-registrado** no boot (ver `main.ts`) — o
 * nome no Inspector é o nome do ARQUIVO (`Girar`). Anexe a qualquer objeto por
 * "Adicionar Componente → Script" e edite o `rpm` ao vivo.
 */
import { ScriptBehavior, type ScriptFieldSchema } from 'cortex-game-engine'

export class Girar extends ScriptBehavior {
  static fields: ScriptFieldSchema = {
    rpm: { type: 'number', default: 30, label: 'Rotação (rpm)' },
  }

  rpm = 30

  override onUpdate(dt: number): void {
    if (this.object3d) this.object3d.rotation.y += (this.rpm / 60) * Math.PI * 2 * dt
  }
}
