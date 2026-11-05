/**
 * As duas queries de medição do passe de sombra da CSM (SPEC-0245): `?semPasseDeSombra=1` e
 * `?semPasseDeSombraNativo=1`. Saíram do `CameraFollowingCSM.ts` com o passe nativo das cascatas (SPEC-0690), que
 * também as consulta, pela regra de 500 linhas.
 */

/** `location.search` da última leitura das queries de medição e o que ela deu. */
let _buscaLida: string | null = null;
let _semPasseDeSombra = false;
let _semPasseDeSombraNativo = false;

/**
 * Lê as duas queries de medição só quando `location.search` muda: as duas são perguntadas todo quadro, e um
 * `URLSearchParams` novo por pergunta era lixo por quadro no Hermes (SPEC-0675).
 */
function lerQueriesDeMedicao(): void {
  const busca = typeof location === 'undefined' ? '' : (location.search ?? '');
  if (busca === _buscaLida) return;
  _buscaLida = busca;
  const params = new URLSearchParams(busca);
  _semPasseDeSombra = params.get('semPasseDeSombra') === '1';
  _semPasseDeSombraNativo = params.get('semPasseDeSombraNativo') === '1';
}

/**
 * `?semPasseDeSombra=1` — FERRAMENTA DE MEDIÇÃO, permanente (SPEC-0245).
 *
 * Congela o passe de sombra INTEIRO: as cascatas do `three` param de desenhar
 * (`autoUpdate = false`) e o passe nativo não assume o lugar delas. O delta
 * contra o baseline é o **teto** do que o marco pode ganhar — foi assim que o
 * teto real de 3,65 ms foi medido, e é assim que ele se remede depois de
 * qualquer mudança no passe.
 *
 * Fica, ao contrário dos interruptores de investigação do M6, porque é a única
 * forma de responder "quanto ainda há para ganhar aqui" sem recompilar nada.
 * E congela sem tocar em `receiveShadow`, em `shadowMap.enabled` ou nos
 * materiais — desligar a luz junto derruba o subsistema e mede outra coisa.
 */
export function congelarPasseDeSombra(): boolean {
  lerQueriesDeMedicao();
  return _semPasseDeSombra;
}

/**
 * `?semPasseDeSombraNativo=1` — devolve o passe de sombra ao `three`.
 *
 * O passe nativo é o **padrão** no host que o oferece (SPEC-0245, decisão do
 * dono do projeto): é ele que entrega os 2,85 ms do marco, e deixá-lo atrás de
 * uma query faria produção pagar o custo do `three` para sempre.
 *
 * Esta query é o caminho de volta, e existe por dois motivos: é a **linha de
 * base** de qualquer remedição do ganho, e é a válvula de escape se o caminho
 * nativo se mostrar errado numa cena que não foi medida. Desligar aqui não
 * perde sombra nenhuma — quem desenha volta a ser o `three`.
 */
export function passeDeSombraNativoDesligado(): boolean {
  lerQueriesDeMedicao();
  return _semPasseDeSombraNativo;
}
