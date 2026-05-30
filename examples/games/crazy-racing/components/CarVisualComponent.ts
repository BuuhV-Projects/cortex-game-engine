import { Component, type Group } from 'cortex-game-engine'

/**
 * Referências visuais do carro que precisam ser animadas separadamente
 * (ex.: rodas dianteiras viram com o steer).
 */
export class CarVisualComponent extends Component {
  constructor(public frontWheels: Group[]) {
    super()
  }
}
