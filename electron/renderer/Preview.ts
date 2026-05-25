// Painel de preview do projeto e console de saída
// Implementação completa nas tasks subsequentes

export class Preview {
  private previewContainer: HTMLElement
  private consoleContainer: HTMLElement

  constructor(previewContainer: HTMLElement, consoleContainer: HTMLElement) {
    this.previewContainer = previewContainer
    this.consoleContainer = consoleContainer
  }

  init(): void {
    // TODO: integrar com window.electronAPI.runProject / stopProject
    //       e exibir logs via window.electronAPI.onLog
  }
}
