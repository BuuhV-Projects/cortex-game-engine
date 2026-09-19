// Portão de AIRSPACE do preview nativo (SPEC-0211).
//
// A janela do host é OWNED (SPEC-0210): fica sempre acima da janela do Studio e
// não é clipada por ela. Logo, tudo que o DOM desenha SOBRE o palco — menu da
// menubar, modal, overlay de drop — nasce escondido atrás do jogo.
//
// A saída é esconder a janela do host enquanto esses overlays estiverem no ar
// (SPEC-0206 já fazia isso para o drag de asset). Como agora são VÁRIAS fontes,
// e elas podem se sobrepor, quem decide é este portão: ele conta as fontes e
// responde APENAS nas transições — abrir um menu com um drag em curso não gera
// mensagem nova, e fechar o menu não revela o host enquanto o drag continuar.
//
// Puro de propósito (sem Electron, sem DOM): é a parte com regra de verdade, e
// dá para testar sem subir o Studio.

/**
 * Conta as fontes que exigem o palco livre e diz quando a visibilidade da janela
 * do host precisa mudar.
 *
 * @example
 * const gate = new AirspaceGate()
 * gate.set('menu', true)   // false → esconder o host
 * gate.set('drag', true)   // null  → já escondido, nada a fazer
 * gate.set('menu', false)  // null  → o drag ainda segura o palco
 * gate.set('drag', false)  // true  → mostrar o host de novo
 */
export class AirspaceGate {
  private readonly blockers = new Set<string>()

  /** Alguma fonte está pedindo o palco livre agora? */
  get blocked(): boolean {
    return this.blockers.size > 0
  }

  /** Fontes que seguram o palco, na ordem de registro (diagnóstico). */
  get sources(): string[] {
    return [...this.blockers]
  }

  /**
   * Registra (`blocking`) ou solta (`!blocking`) uma fonte.
   *
   * @returns a visibilidade que a janela do host deve passar a ter, ou `null`
   * quando nada muda — o chamador só manda mensagem no canal quando vier um
   * booleano.
   */
  set(source: string, blocking: boolean): boolean | null {
    const wasBlocked = this.blocked
    if (blocking) this.blockers.add(source)
    else this.blockers.delete(source)
    const isBlocked = this.blocked
    if (wasBlocked === isBlocked) return null
    return !isBlocked
  }

  /**
   * Solta todas as fontes de uma vez — é o que o `stopNative` precisa para não
   * deixar o portão sujo entre uma sessão de preview e a seguinte.
   *
   * @returns `true` se isso revelou o host, `null` se nada estava segurando.
   */
  clear(): boolean | null {
    if (!this.blocked) return null
    this.blockers.clear()
    return true
  }
}
