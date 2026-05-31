import { Component } from '../ecs/Component.js';

/**
 * Transform "lógico" de uma entidade no plano XZ + altura Y.
 *
 * Mantém a posição e o heading (yaw) como dados puros, desacoplados do
 * `Object3D` de renderização — o `Object3DSyncSystem` copia este estado para
 * o mesh a cada frame. `rotationY` em radianos; sentido positivo gira
 * anti-horário visto de cima (convenção three.js).
 *
 * Pitch/roll (inclinação no terreno) NÃO ficam aqui — vivem no
 * `GroundConformComponent` e são aplicados direto no `Object3D`, pois são
 * efeito visual derivado, não estado de gameplay.
 */
export class TransformComponent extends Component {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public rotationY = 0,
  ) {
    super();
  }
}
