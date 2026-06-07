import { System } from '../ecs/System.js';
import { Entity } from '../ecs/Entity.js';
import { SpriteAnimationComponent } from '../components/SpriteAnimationComponent.js';

/**
 * Avança as {@link SpriteAnimationComponent}: acumula tempo, calcula o frame atual
 * pela cadência (`fps`) e aplica o recorte UV na textura do sprite. Loop ou trava
 * no último frame conforme a animação. Troque de animação com
 * `component.play('run')` — o sistema reflete no próximo tick.
 */
export class SpriteAnimationSystem extends System {
  static override requiredComponents = [SpriteAnimationComponent];
  override priority = 15;

  override update(entities: Entity[], deltaTime: number): void {
    const dt = deltaTime / 1000;
    for (const e of entities) {
      const a = e.getComponent(SpriteAnimationComponent)!;
      if (!a.current) continue;
      const anim = a.anims[a.current];
      if (!anim || anim.frames.length === 0) continue;

      a.time += dt;
      const fps = anim.fps ?? 10;
      let idx = Math.floor(a.time * fps);
      if (anim.loop === false) idx = Math.min(idx, anim.frames.length - 1);
      else idx %= anim.frames.length;

      if (idx !== a.frameIndex) {
        a.frameIndex = idx;
        a.sheet.applyFrame(a.texture, anim.frames[idx]!);
      }
    }
  }
}
