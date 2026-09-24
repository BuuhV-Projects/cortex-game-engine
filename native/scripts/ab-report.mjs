// ab-report.mjs — análise A/B dos traces coletados pelo ab-bench.ps1 (TDR-0007).
//
// NÃO compara médias. Agrupa os frames por faixa de draws e compara DENTRO de
// cada faixa, porque a média é dominada por onde a IA passou: se numa rodada
// ela viu mais carros, a média piora sem que nada tenha ficado mais lento.
// Comparando por faixa, a pergunta vira "com o mesmo trabalho na tela, quanto
// custa" — que é a única que tem resposta estável.
//
// O veredito de cada faixa vem de um intervalo de confiança por bootstrap, e
// "indistinguível" é um resultado legítimo: é a informação que faltou nas
// SPECs 0016 a 0019.
//
// Uso: node native/scripts/ab-report.mjs <dir> [--a NomeA] [--b NomeB]
//                                        [--metrica frameMs|render|world|ui]
import fs from 'node:fs';
import path from 'node:path';

/** Descartado no início de cada rodada: carga, compilação e largada não são
 * o regime que se quer medir. */
const TEMPO_DE_AQUECIMENTO_MS = 25_000;
/** `frameMs` satura em 100 no host — acima disso o valor não é o tempo real. */
const FRAME_MS_SATURADO = 100;
/** Largura das faixas de draws. Estreita demais esvazia as faixas; larga
 * demais deixa de controlar a trajetória, que é o objetivo. */
const LARGURA_DA_FAIXA = 10;
/** Mínimo de amostras nos DOIS lados para uma faixa render veredito. */
const MIN_AMOSTRAS_POR_FAIXA = 20;
/** Reamostragens do bootstrap. 2000 é o joelho: mais que isso muda o IC na
 * terceira casa e custa tempo. */
const REAMOSTRAGENS = 2000;
/** Confiança do intervalo, ANTES da correção por múltiplas comparações. */
const CONFIANCA = 0.95;

/** Lê um trace, já sem aquecimento e sem frame saturado. */
function lerTrace(arquivo) {
  return fs
    .readFileSync(arquivo, 'utf8')
    .trim()
    .split(/\r?\n/)
    .map((linha) => {
      try {
        return JSON.parse(linha);
      } catch {
        return null;
      }
    })
    .filter((r) => r && r.cpu && r.t > TEMPO_DE_AQUECIMENTO_MS && r.frameMs < FRAME_MS_SATURADO && r.draws > 0);
}

const mediana = (valores) => {
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = ordenado.length >> 1;
  return ordenado.length % 2 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2;
};

/**
 * Intervalo de confiança da diferença de medianas (B menos A), por bootstrap.
 *
 * Bootstrap porque a distribuição de frame time tem cauda longa à direita —
 * supor normalidade daria um intervalo otimista demais justamente onde estão
 * os frames que o jogador sente.
 */
function intervaloDaDiferenca(a, b, confianca) {
  const diferencas = new Array(REAMOSTRAGENS);
  for (let i = 0; i < REAMOSTRAGENS; i++) {
    const amostraA = new Array(a.length);
    for (let k = 0; k < a.length; k++) amostraA[k] = a[(Math.random() * a.length) | 0];
    const amostraB = new Array(b.length);
    for (let k = 0; k < b.length; k++) amostraB[k] = b[(Math.random() * b.length) | 0];
    diferencas[i] = mediana(amostraB) - mediana(amostraA);
  }
  diferencas.sort((x, y) => x - y);
  const cauda = (1 - confianca) / 2;
  return {
    baixo: diferencas[Math.floor(cauda * (REAMOSTRAGENS - 1))],
    alto: diferencas[Math.floor((1 - cauda) * (REAMOSTRAGENS - 1))],
  };
}

/** O veredito é literal: o intervalo cruzar zero é um resultado, não um erro. */
function veredito(ic) {
  if (ic.alto < 0) return 'MELHORA';
  if (ic.baixo > 0) return 'PIORA';
  return 'indistinguivel';
}

const args = process.argv.slice(2);
const diretorio = args.find((a) => !a.startsWith('--'));
const opcao = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
};
if (!diretorio || !fs.existsSync(diretorio)) {
  console.error('uso: node native/scripts/ab-report.mjs <dir dos traces> [--a NomeA] [--b NomeB] [--metrica frameMs|render|world|ui]');
  process.exit(1);
}
const nomeA = opcao('a', 'A');
const nomeB = opcao('b', 'B');
const metrica = opcao('metrica', 'frameMs');
const valorDa = (r) => (metrica === 'frameMs' ? r.frameMs : r.cpu[metrica]);

const arquivos = fs.readdirSync(diretorio).filter((f) => f.endsWith('.jsonl'));
const carregar = (nome) =>
  arquivos.filter((f) => f.startsWith(`${nome}-`)).flatMap((f) => lerTrace(path.join(diretorio, f)));

const A = carregar(nomeA);
const B = carregar(nomeB);
const rodadasA = arquivos.filter((f) => f.startsWith(`${nomeA}-`)).length;
const rodadasB = arquivos.filter((f) => f.startsWith(`${nomeB}-`)).length;

if (!A.length || !B.length) {
  console.error(`sem amostras: ${nomeA}=${A.length} (${rodadasA} rodadas), ${nomeB}=${B.length} (${rodadasB} rodadas)`);
  process.exit(1);
}

console.log(`metrica: ${metrica}   (menor e melhor)`);
console.log(`${nomeA}: ${rodadasA} rodadas, ${A.length} amostras`);
console.log(`${nomeB}: ${rodadasB} rodadas, ${B.length} amostras`);
console.log('');

// A mediana geral vai primeiro DE PROPÓSITO, com a ressalva: é o número que
// engana, e vê-lo ao lado do binning é o que mostra por quê.
const medA = mediana(A.map(valorDa));
const medB = mediana(B.map(valorDa));
console.log(`mediana geral (NAO decide nada): ${nomeA}=${medA.toFixed(2)}  ${nomeB}=${medB.toFixed(2)}  delta=${(medB - medA).toFixed(2)}`);
console.log(`draws mediano: ${nomeA}=${mediana(A.map((r) => r.draws))}  ${nomeB}=${mediana(B.map((r) => r.draws))}`);
console.log('');
console.log('Por faixa de draws — mesmo trabalho na tela:');
console.log(
  'faixa'.padEnd(12) + 'n(A)'.padStart(6) + 'n(B)'.padStart(6) + nomeA.padStart(9) + nomeB.padStart(9) +
  'delta'.padStart(8) + 'IC 95%'.padStart(18) + '  veredito',
);

const todosDraws = [...A, ...B].map((r) => r.draws);
const primeira = Math.floor(Math.min(...todosDraws) / LARGURA_DA_FAIXA) * LARGURA_DA_FAIXA;
const ultima = Math.floor(Math.max(...todosDraws) / LARGURA_DA_FAIXA) * LARGURA_DA_FAIXA;
const vereditos = [];

/** As faixas com amostra suficiente nos dois lados. */
const faixas = [];
for (let inicio = primeira; inicio <= ultima; inicio += LARGURA_DA_FAIXA) {
  const fim = inicio + LARGURA_DA_FAIXA;
  const dentro = (rs) => rs.filter((r) => r.draws >= inicio && r.draws < fim).map(valorDa).filter((v) => v != null);
  faixas.push({ inicio, fim, a: dentro(A), b: dentro(B) });
}
const testaveis = faixas.filter((f) => f.a.length >= MIN_AMOSTRAS_POR_FAIXA && f.b.length >= MIN_AMOSTRAS_POR_FAIXA);

// Correção de Bonferroni. Sem ela, 10 faixas a 95% produzem ~0,5 falso
// positivo por comparação — medido: o cenário SEM EFEITO NENHUM acusava uma
// faixa em "melhora", e uma faixa isolada é exatamente o que alguém
// interpretaria como ganho.
const confiancaPorFaixa = testaveis.length > 0 ? 1 - (1 - CONFIANCA) / testaveis.length : CONFIANCA;
if (testaveis.length > 1) {
  console.log(`(${testaveis.length} faixas testadas; confianca por faixa corrigida para ${(confiancaPorFaixa * 100).toFixed(2)}%)`);
}

for (const faixa of faixas) {
  const { inicio, fim, a, b } = faixa;
  const rotulo = `${inicio}-${fim - 1}`;
  if (a.length < MIN_AMOSTRAS_POR_FAIXA || b.length < MIN_AMOSTRAS_POR_FAIXA) {
    console.log(rotulo.padEnd(12) + String(a.length).padStart(6) + String(b.length).padStart(6) + '  amostras de menos');
    continue;
  }
  const ma = mediana(a);
  const mb = mediana(b);
  const ic = intervaloDaDiferenca(a, b, confiancaPorFaixa);
  const v = veredito(ic);
  vereditos.push({ rotulo, v, delta: mb - ma, peso: a.length + b.length });
  console.log(
    rotulo.padEnd(12) + String(a.length).padStart(6) + String(b.length).padStart(6) +
    ma.toFixed(2).padStart(9) + mb.toFixed(2).padStart(9) + (mb - ma).toFixed(2).padStart(8) +
    `[${ic.baixo.toFixed(2)}, ${ic.alto.toFixed(2)}]`.padStart(18) + '  ' + v,
  );
}

console.log('');
if (vereditos.length === 0) {
  console.log('VEREDITO: nenhuma faixa teve amostras suficientes. Rode mais rodadas ou aumente a duracao.');
} else {
  const melhora = vereditos.filter((x) => x.v === 'MELHORA');
  const piora = vereditos.filter((x) => x.v === 'PIORA');
  const nulo = vereditos.filter((x) => x.v === 'indistinguivel');
  console.log(`VEREDITO: ${melhora.length} faixa(s) melhoram, ${piora.length} pioram, ${nulo.length} indistinguiveis (de ${vereditos.length}).`);
  if (melhora.length && !piora.length) {
    const ganho = melhora.reduce((s, x) => s + x.delta * x.peso, 0) / melhora.reduce((s, x) => s + x.peso, 0);
    console.log(`  ${nomeB} e melhor. Ganho medio nas faixas com sinal: ${Math.abs(ganho).toFixed(2)} ms.`);
  } else if (piora.length && !melhora.length) {
    console.log(`  ${nomeB} e PIOR. Nao mescle sem entender por que.`);
  } else if (melhora.length && piora.length) {
    console.log('  Sinal MISTO: melhora numas faixas e piora noutras. Olhe quais — o efeito depende da carga.');
  } else {
    console.log('  Nenhum efeito acima do ruido. Se for mesclar, que seja pelo mecanismo, explicitamente.');
  }
}
