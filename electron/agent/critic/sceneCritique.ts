import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

/**
 * "Olhos frescos": pede a um Claude single-shot (sem histórico, sem tools) pra
 * COMPARAR o screenshot da cena montada com a imagem de referência e devolver uma
 * crítica de BELEZA acionável. O agente principal está mergulhado no contexto de
 * construção e tende a achar que "ficou bom"; um crítico isolado, vendo só as
 * duas imagens + uma rubrica, dá um checklist objetivo do que falta pra chegar
 * na referência (ADR/feature do passe de crítica via sub-agent).
 *
 * Usa o `@anthropic-ai/claude-agent-sdk` (mesma auth do Chat IA — OAuth do
 * `claude login` ou ANTHROPIC_API_KEY), em modo single-shot multimodal.
 */

const CRITIC_SYSTEM_PROMPT = `\
Você é um diretor de arte crítico avaliando o CENÁRIO 3D de um jogo. Recebe duas \
imagens: IMAGEM 1 = referência (o alvo de beleza) e IMAGEM 2 = o resultado atual \
montado pela IA. Seu trabalho é dizer, sem dó, o que falta no resultado pra ficar \
tão bonito quanto a referência — focando no que mais impacta a percepção de \
"jogo bonito" vs "protótipo".

Avalie nesta ordem de impacto e seja CONCRETO e ACIONÁVEL (valores, direções, \
quantidades — não elogios vagos):

1. ATMOSFERA / LUZ (geralmente o que mais falta):
   - Paleta: as cores dominantes batem? (diga em palavras/hex aproximado o que \
     ajustar: céu mais saturado, água mais turquesa, etc.)
   - Iluminação/mood: direção, calor (quente/frio) e contraste das sombras batem? \
     A referência parece golden hour / meio-dia / nublado e o resultado também?
   - Pós-processamento: falta bloom/glow? vignette? a exposição está chapada ou \
     estourada? há névoa dando profundidade?
2. DENSIDADE / RIQUEZA: o resultado está "pelado" perto da referência? Falta \
   vegetação, props, detalhe, variação? Onde (quais áreas) adicionar.
3. COMPOSIÇÃO / LAYOUT: silhueta, agrupamento, espaçamento e conexões batem com \
   a intenção da referência?
4. CÂMERA: o enquadramento valoriza como na referência?

Formato da resposta (markdown, conciso):
- **Distância visual: N/10** (10 = idêntico em beleza à referência).
- **Top 3 correções de maior impacto** (ordenadas), cada uma com a AÇÃO concreta \
  (ex.: "ligar bloom ~0.6 e exposição 1.05", "adicionar 6–8 árvores em cluster no \
  fundo-esquerdo", "névoa mais densa cor do céu near=40").
- **Outros ajustes** (lista curta).
Se o resultado já estiver muito perto, diga e não invente problemas.`

type ImgMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

function mimeOf(path: string): ImgMime {
  switch (extname(path).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'image/png'
  }
}

export interface CritiqueOptions {
  /** Caminho da imagem de referência (alvo de beleza). */
  referencePath: string
  /** Caminho do screenshot da cena montada (ex.: do playtest_game). */
  screenshotPath: string
  /** O que o usuário pediu / o spec da cena, pra contextualizar a crítica. */
  goal?: string
}

/** Roda a crítica e devolve o texto (markdown). */
export async function critiqueScene(opts: CritiqueOptions): Promise<string> {
  const [refBuf, shotBuf] = await Promise.all([
    readFile(opts.referencePath),
    readFile(opts.screenshotPath),
  ])

  const userMessage: SDKUserMessage = {
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: [
        {
          type: 'text',
          text:
            `Objetivo/spec da cena: ${opts.goal?.trim() || '(não informado — infira da referência)'}\n\n` +
            `IMAGEM 1 — REFERÊNCIA (alvo de beleza):`,
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeOf(opts.referencePath), data: refBuf.toString('base64') },
        },
        { type: 'text', text: 'IMAGEM 2 — RESULTADO ATUAL (cena montada a avaliar):' },
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeOf(opts.screenshotPath), data: shotBuf.toString('base64') },
        },
        { type: 'text', text: 'Critique conforme suas instruções.' },
      ],
    },
  }

  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    yield userMessage
  }

  const q = query({
    prompt: prompt(),
    options: { systemPrompt: CRITIC_SYSTEM_PROMPT, allowedTools: [], includePartialMessages: false },
  })

  let text = ''
  for await (const msg of q) {
    const m = msg as { type?: string; message?: { content?: Array<{ type?: string; text?: string }> } }
    if (m.type === 'assistant' && Array.isArray(m.message?.content)) {
      for (const block of m.message.content) {
        if (block.type === 'text' && typeof block.text === 'string') text += block.text
      }
    }
  }
  return text.trim()
}
