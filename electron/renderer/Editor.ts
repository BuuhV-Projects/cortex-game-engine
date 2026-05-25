// Wrapper do Monaco Editor
// Implementação completa nas tasks subsequentes

export class Editor {
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  init(): void {
    // TODO: instanciar monaco.editor.create com tema escuro (vs-dark)
    //       e configurar worker TypeScript via MonacoEnvironment.getWorkerUrl
  }
}
