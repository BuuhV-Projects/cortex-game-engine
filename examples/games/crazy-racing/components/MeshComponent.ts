import { Component, type Object3D } from 'cortex-game-engine'

export class MeshComponent extends Component {
  constructor(public object: Object3D) {
    super()
  }
}
