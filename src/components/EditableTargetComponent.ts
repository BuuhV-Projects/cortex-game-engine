import { Component } from '../ecs/Component.js';

/**
 * Marcador: entidades editáveis no modo editor. O `EditorMode` usa este
 * componente para descobrir o que pode ser teleportado/manipulado de forma
 * genérica, sem o engine conhecer tipos específicos de jogo (ex.: veículo).
 */
export class EditableTargetComponent extends Component {}
