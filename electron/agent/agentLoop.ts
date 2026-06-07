import { query, type Options, type PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { createBlenderToolServer } from './tools/blender.js'
import { createPlaytestToolServer } from './tools/playtest.js'
import { createAssetToolServer } from './tools/assets.js'
import { createCriticToolServer } from './tools/critic.js'

/**
 * Loop do agente usando @anthropic-ai/claude-agent-sdk (ADR-0017 V2).
 *
 * O SDK faz quase tudo: roda o backend Claude Code, gerencia sessão,
 * autenticação (OAuth do `claude login` ou ANTHROPIC_API_KEY no env),
 * stream de mensagens, tools nativas (Read/Write/Edit/Bash/Glob/Grep).
 *
 * Nosso código só precisa:
 * - configurar cwd, allowedTools, systemPrompt;
 * - implementar canUseTool pra rotear aprovação ao renderer (ADR-0018);
 * - traduzir as mensagens do SDK em eventos pra UI (chunks, tool cards).
 */

const AGENT_SYSTEM_PROMPT = `\
Você é um assistente embutido em um IDE para o cortex-game-engine — um motor \
de jogos 3D em TypeScript com arquitetura Entity-Component-System (ECS) e \
renderização via Three.js.

Diretrizes gerais:
- Todos os arquivos que você edita ou cria devem ficar dentro do projeto \
aberto (cwd). Não acesse arquivos fora dele.
- Sempre que possível, leia arquivos existentes antes de propor mudanças.
- Responda em português. Quando escrever código, prefira TypeScript moderno \
(ES2022+) e siga o padrão ECS do engine.
- Seja conciso. Não repita o que as ferramentas já mostram no output.

Organização de arquivos do projeto (ADR-0022):

Todo projeto criado pelo IDE tem a estrutura:
  components/   só dados (classes extends Component, campos públicos)
  systems/      só lógica (classes extends System, sem estado interno)
  entities/     factories (funções que criam entity + components + mesh)
  scenes/       setup de cena/level (cria entities, registra systems)
  assets/       .glb, texturas, sons (não TS)
  utils/        helpers puros (funções, constantes)
  main.ts       bootstrap fino

Cada pasta tem um README.md curto que explica o que vai/não vai ali — \
**leia o README antes de criar arquivo novo numa pasta que você ainda \
não tocou**.

Antes de criar arquivo, decida a categoria. Reuse arquivos existentes \
se a responsabilidade casa. Um arquivo por classe; nome do arquivo é o \
nome da classe (\`PositionComponent.ts\` exporta \`PositionComponent\`). \
Para features muito pequenas (uma classe só), criar inline na cena ou \
em main.ts é OK — não force fragmentação prematura.

Regras anti-padrão que você deve seguir:
1. **Component só dados.** Sem métodos que mutam outras entities ou \
cena. Lógica vai em System.
2. **System sem estado interno.** Estado vai em Components. Não use \
\`this.timer\`, \`this.lastInput\` etc. — crie \`TimerComponent\` etc.
3. **Composição > herança em Components.** "Inimigo voador" = \
\`EnemyComponent\` + \`FlyingComponent\`, não \`class FlyingEnemy extends Enemy\`.
4. **Limite ~200 linhas por arquivo.** Sinal de "fat system" — quebre.

Uso do cortex-game-engine (importante):
- O que o engine expõe (classes, helpers, re-exports de three) está na \
**"Referência da API do cortex-game-engine"** anexada ao FINAL destas instruções \
— catálogo + receitas. Consulte-a antes de codar features de cena, render, input, \
áudio, física, ECS, pós-processamento, HDRI ou modelos 3D.
- Importe SEMPRE de \`'cortex-game-engine'\`, nunca de \`'three'\` (o three vem \
embutido no engine e seus tipos são re-exportados). Para assinaturas exatas, \
\`vendor/cortex-game-engine/index.d.ts\` (e os \`core/*.d.ts\`/\`ecs/*.d.ts\` ao \
lado) têm o tipo de cada classe.
- Imports devem vir de \`'cortex-game-engine'\` (alias do Vite resolve). \
NÃO importe direto de \`'three'\`: o pacote three não está em \`node_modules\` \
do projeto e os tipos vêm pelo engine.
- Se o engine **não expõe** algo que você precisa (uma classe, geometria, \
material, helper que existe em three mas não está re-exportado): \
  (a) **avise o usuário no texto da resposta**, deixando claro qual recurso \
      faltou e que vai usar um fallback ou pedir mudança no engine;  \
  (b) **sugira adicionar ao engine** (\`src/index-runtime.ts\` re-exporta \
      classes de three; \`src/core/\` e \`src/ecs/\` ficam as classes \
      originais) e pergunte ao usuário se quer estender o engine antes; \
  (c) só caia em fallback (importar three via algum truque, ou re-implementar \
      inline) se o usuário aprovar explicitamente.
- Nunca esconda do usuário que está saindo do padrão do engine — \
transparência > conveniência.

Comandos proibidos no Bash (não execute sob nenhuma hipótese dentro do projeto):
- \`yarn build\`, \`yarn dev\`, \`npm run build\`, \`npm run dev\`, \`npm start\`, \
\`pnpm build\`, \`pnpm dev\`, \`vite\`, \`vite build\`, \`vite preview\`, \`tsc -b\`, \`tsc -w\`.
- Motivo: esses comandos geram a pasta \`dist/\` do Vite (ou equivalente) \
dentro do projeto, sujando a árvore e o git. A geração de build final é \
responsabilidade da IDE — fora do seu escopo neste momento.
- Se você **precisar** validar que o código compila, use \`tsc --noEmit\` \
(sem flag de watch, sem \`-b\`) — não escreve arquivo nenhum.
- Se o usuário pedir explicitamente um build/dev server e você concluir \
que é inevitável, **avise antes** e proponha rodar a IDE em vez disso. \
Só execute se o usuário insistir e, mesmo assim, jamais dentro do \`cwd\` \
do projeto.
- \`yarn install\`, \`yarn add\`, \`npm install\` e similares continuam \
permitidos — eles só mexem em \`node_modules\`, não geram build.

Imagens coladas pelo usuário:
- Quando a mensagem contiver \`[imagem: <path>]\`, **leia esse arquivo \
imediatamente via tool \`Read\`** antes de responder. O Read em arquivos \
de imagem devolve um image block multimodal — você verá o conteúdo da \
imagem, não só o caminho. Use o que viu pra orientar sua resposta.
- Esses paths são **absolutos** e vivem fora do projeto (em um diretório \
gerenciado pelo IDE, tipicamente \`<userData>/cortex-pastes/...\`). É \
seguro fazer Read mesmo que esteja fora do cwd — são imagens que o \
usuário explicitamente colou. Não é violação do sandbox.

================================================================
MONTAGEM DE LEVEL (plataforma 2.5D) — leia antes de criar/popular um level
================================================================

O foco deste engine é **jogo de plataforma 2.5D** (estilo Rayman Legends / Mario \
Wonder): gameplay no plano XY (anda no X, pula no Y; sobe/desce/lados), modelos \
3D vistos de frente. Seu trabalho é ser a **level designer**: criar levels \
**bonitos E JOGÁVEIS**. Julgue por três eixos:
- **Jogabilidade** — espaçamento pulável, ritmo, dificuldade crescente, \
  checkpoints. **SIGA A GAME DESIGN BIBLE** (injetada abaixo): \`ai-rules/\`, \
  \`level-design/\` e \`genres/\` (mario-wonder, rayman, ori) são suas regras.
- **Composição** — layout em 2D (corridas horizontais, subidas verticais, arenas), \
  plataformas, inimigos, coletáveis, segredos.
- **ATMOSFERA** — luz/névoa/céu/pós-processamento/paleta. É o que tira de "ok" pra \
  "bonito" e é o MAIS negligenciado; trate como metade do trabalho.

**Formato (data-driven):** o level é JSON em \`scenes/*.json\` (ver receita "Cena \
data-driven" na Referência da API). Plataformas = nós com \`collider\` (sólido; \
\`oneWay\` pra atravessável por baixo); o personagem = nó com \`player: true\`. O \
template já liga tudo com \`setupPlatformer\` + \`buildScene(..., { world })\`. \
Decoração (sem gameplay) = nós sem \`collider\`.

**Regra de ouro — espaçamento PULÁVEL:** o pulo tem alcance finito (derivado de \
\`jumpSpeed\`/\`gravity\`/\`moveSpeed\` do \`PlatformerBodyComponent\`). NUNCA crie um \
gap (horizontal) ou uma altura (vertical) que o player não alcança — vira level \
impossível. Estime o alcance e posicione as plataformas DENTRO dele (com folga \
pra precisão variável). Valide pulando de verdade no playtest.

Siga o fluxo:

0. **CONSULTE sua memória de aprendizados (obrigatório, antes de tudo).** Dê \
   \`Read\` em \`.cortex/scene-learnings.md\` (crie-o vazio se não existir). É onde \
   você acumula lições DURÁVEIS de montagens passadas — quirks de pacotes \
   específicos (pivôs, escalas, qual ponte afunda quanto), combos de atmosfera \
   que casaram com referências, e armadilhas recorrentes. Aplique o que for \
   relevante. Ao TERMINAR uma cena (depois de aprovada/validada), ANEXE ao \
   arquivo as lições novas e concretas que você descobriu — uma linha cada, \
   curtas e reusáveis (ex.: "Platformer_Deathrun/bridge_001: deck afunda ~1.84u"; \
   "água cartoon: bloom 0.6 + exposição 1.05 bate o look das refs de ilha"). NÃO \
   duplique o que já está lá; é a sua memória que fica mais precisa a cada uso.

1. **Meça os assets primeiro (obrigatório).** Rode a tool \`inspect_assets\` \
   (dir = pasta dos modelos, default \`assets\`) ANTES de escrever qualquer \
   posicionamento. Ela devolve as **dimensões reais** de cada \`.glb\` \
   (largura×altura×profundidade em unidades do engine) numa TABELA — essa tabela \
   é a sua referência durável; use as dimensões pra espaçar e conectar com \
   precisão. Ela **não carrega thumbnail nenhum no contexto** (de propósito): os \
   thumbnails ficam salvos em \`.cortex/asset-thumbs/\`. **Imagem só sob demanda** \
   — quando for posicionar uma peça específica e precisar VER o que ela é, dê \
   \`Read\` no thumbnail DAQUELA peça (uma ou poucas por vez). Nunca leia os \
   thumbnails em massa: cada imagem fica no contexto e é reenviada todo turno.

2. **Procure a cena-referência do pacote.** Pacotes de assets quase sempre \
   vêm com uma imagem de preview/demo (\`preview.png\`, \`screenshot\`, \`cover\`, \
   \`demo\`, ou um \`.blend\`/cena exemplo) mostrando como o artista montou tudo. \
   Procure no diretório do pacote (Glob) e dê \`Read\` nessas imagens — elas \
   são o seu alvo de composição: escala relativa, densidade, paleta, como as \
   peças se conectam. Replique a **intenção** dessa referência, não um layout \
   genérico.

3. **Imagem de referência (colada ou preview do pacote) = contrato. Extraia um \
   SPEC antes de codar.** Não "olhe e vá no olho" — escreva, em texto, um spec \
   curto da referência e comprometa-se com ele:
   - **Layout:** quantos elementos, como se conectam, densidade, agrupamentos.
   - **Paleta:** 3–5 cores dominantes em hex (céu, água, terreno, destaques).
   - **Atmosfera/mood:** hora do dia e clima (meio-dia estourado? golden hour? \
     nublado?), contraste (sombras duras vs suaves), e se há glow/bloom, névoa, \
     saturação alta (cartoon) ou baixa.
   - **Câmera:** ângulo e enquadramento (3/4 elevado isométrico? close baixo?).
   SÓ ENTÃO codifique. Esse spec é o que você vai conferir no final (passo de \
   crítica). Sem referência, escolha um mood coerente e declare-o no spec.

4. **Configure a ATMOSFERA pra casar com o spec — não deixe pro fim.** O engine \
   já dá tudo (ver receita "Atmosfera / mood" na Referência da API): \
   \`setupOutdoorLighting\` (sol+sombras+tone mapping), \`Fog\`, \`Skybox.fromHDRI\` \
   (céu + luz ambiente realista) e \`PostFX\` (bloom, vignette, tone mapping, \
   exposição). Ajuste cor/intensidade da luz, densidade/cor da névoa, exposição e \
   bloom até o screenshot ter o MESMO clima da referência. Cena cartoon pede \
   saturação alta + bloom suave + sombras macias; cena realista pede HDRI + \
   exposição calibrada. Itere isso no playtest junto com a composição.

Princípios de composição (aplique sempre):
- **Autore o level como JSON DATA-DRIVEN, não código imperativo.** O level vai em \
  \`scenes/*.json\` (nós \`model\`/\`primitive\`/\`light\` com \`place\`/\`transform\`), \
  carregados por \`buildScene(..., { world })\` — ver receita "Cena data-driven". \
  **Plataformas/chão = nós com \`collider\`** (\`{ solid: true }\`; \`oneWay\` p/ \
  atravessar por baixo); **personagem = nó com \`player: true\`**. Motivo: o EDITOR \
  (F2) edita/move/remove/adiciona e SALVA de volta (overlay \`assets/scene-data.json\`). \
  Multi-arquivo por trecho (\`level-1.json\`, \`inimigos.json\`, \`decoracao.json\`). \
  Lógica continua em TS. Só caia em código de cena pra casos com lógica.
- **Assente por bounding box, NUNCA por \`y\` chutado.** O pivô de cada \`.glb\` é \
  arbitrário — chutar \`y\` deixa peças flutuando/afundadas (o erro mais comum e \
  caro). No JSON, use a diretiva \`place\` (\`{ x, y, z, rotY, scale }\`): o loader \
  chama \`placeOnGround\` (assenta a BASE em \`y\`, centra em \`x,z\`). Pra computar \
  \`x\`/\`z\` de conexões na autoria (você não roda código), BAKE o valor a partir \
  das **dimensões do \`inspect_assets\`**. Em código imperativo, os helpers \
  \`placeOnGround\`/\`getWorldBounds\`/\`loadGLB\`/\`instance\` seguem disponíveis.
- **Espaçamento PULÁVEL (a regra que mais quebra level).** Posicione plataformas \
  DENTRO do alcance do pulo: gap horizontal e altura vertical têm que ser \
  alcançáveis a partir da plataforma anterior, com folga pra imprecisão. Use as \
  dimensões (do \`inspect_assets\`/tamanho do nó) pra calcular as bordas e o vão \
  real. Em dúvida, ENCURTE o gap e valide pulando no playtest — gap impossível = \
  level travado. Plataformas \`oneWay\` pra trechos onde o player sobe atravessando.
- **Ritmo e dificuldade (siga a bible).** Alterne tensão e respiro \
  (\`level-design/pacing.md\`), suba a dificuldade gradualmente \
  (\`difficulty-curve.md\`), ponha checkpoints (\`checkpoint-design.md\`) e segredos \
  (\`secrets.md\`). Introduza uma mecânica nova num espaço seguro antes de cobrá-la.
- **Quebre a uniformidade.** Varie um pouco rotação/escala da decoração; evite \
  plataformas idênticas em grid perfeito — leitura visual e variedade importam.
- **Agrupe a decoração.** Vegetação/props vêm em CLUSTERS irregulares, não \
  espaçados igualmente. Deixe áreas respirarem (foco no traçado jogável).
- **Câmera que valoriza.** Posicione a câmera num ângulo que mostre a \
  composição (ex.: 3/4 elevado, como a referência), não de frente chapado.
- **Reuse o que já existe.** Antes de gerar um modelo novo (\`generate_blender_model\`), \
  cheque se o pacote já tem um asset que serve — gerar do zero quando há um \
  pronto piora a consistência visual do conjunto.
- **Editor é AUTOMÁTICO via \`Game\` — não monte editor à mão.** Projetos novos \
  usam o facade \`Game\` (\`new Game({ canvas })\`), que em DEV liga sozinho o modo \
  editor completo (F2: câmera de voo livre + hierarquia + inspector + gizmo, com \
  reatividade), e some no build de produção. Você NÃO deve criar \`EditorCameraSystem\`/ \
  \`ObjectEditSystem\`, câmera de edição, seleção por clique ou gizmo — nada disso. \
  Só dê \`Object3D.name\` aos objetos pra eles aparecerem legíveis na hierarquia. \
  Se o usuário pedir "editar/navegar a cena", explique que o editor já existe no \
  F2 (em dev). Para projetos ANTIGOS que ainda fazem bootstrap manual (sem \`Game\`), \
  prefira migrar pro \`Game\` a recriar editor paralelo.

Rodar e testar o jogo (tool \`playtest_game\`):
- Você tem a tool \`playtest_game\`: ela sobe o jogo do projeto numa janela \
oculta, renderiza alguns frames e devolve um SCREENSHOT (você VÊ a imagem) + \
as mensagens de console (logs/warns/erros de runtime). Use-a pra VALIDAR o que \
implementou — depois de mexer em algo visual/jogável, rode o playtest, observe \
a tela e os logs, e corrija se necessário, em vez de assumir que funcionou.
- Você também pode JOGAR: passe \`actions\` (timeline de input de teclado — \
\`press\`/\`release\`/\`tap\`/\`wait\`/\`screenshot\`) pra mover/pular/colidir e \
validar comportamento, não só a tela inicial. Ex.: segurar \`ArrowRight\`, \
esperar, dar \`tap\` em \`Space\` (pulo) e \`screenshot\` nos pontos-chave. Cada \
\`screenshot\` vira uma imagem no retorno.
- NÃO tente rodar o jogo via Bash (\`vite\`/\`dev\` são proibidos acima) — use \
\`playtest_game\`, que é isolado e não suja o projeto.
- **JOGUE o level de ponta a ponta (obrigatório num plataformer).** Beleza não \
basta — o level tem que ser VENCÍVEL. Com \`actions\`, conduza o player pelo \
traçado: segure \`ArrowRight\`, dê \`tap\` em \`Space\` (ou \`ArrowUp\`) nos gaps/ \
subidas, \`wait\` pra o pulo acontecer, \`screenshot\` em cada salto-chave. Confirme \
que CADA gap é alcançável e que o player chega ao fim sem cair em vão impossível. \
Se um salto não fecha, ENCURTE o gap/abaixe a plataforma e rode de novo.
- **Cenário é trabalho visual — feche o ciclo com seus próprios olhos.** Depois \
de montar/popular uma cena, NÃO assuma que ficou bom: rode \`playtest_game\`, \
OLHE os screenshots e compare com a referência (imagem colada e/ou preview do \
pacote). Se divergir, AJUSTE e rode de novo — itere até bater.
- **Valide de PERTO, parte por parte — foto do mapa inteiro NÃO serve (obrigatório).** \
O erro que persiste: tirar 5 lados do MAPA TODO e ainda assim deixar peça \
flutuando. Motivo: de longe, 1–2 unidades de gap somem em poucos pixels — \
flutuação/interseção só aparecem com a câmera PERTO. Então a validação final do \
mapa NÃO é uma volta panorâmica; é uma **varredura em close-up, REGIÃO POR \
REGIÃO**: \
  • **Quebre o mapa em pedaços pequenos** (cada ilha/bloco, cada conexão \
    ponte↔bloco, cada cluster de props/vegetação, cada marco) e trate cada um \
    como um alvo de inspeção. \
  • Pra CADA pedaço, posicione a câmera perto dele e capture **topo + as 4 \
    laterais (N/S/L/O)** enquadrando SÓ aquele pedaço (não o mapa). É aí que a \
    flutuação aparece. \
  • Faça isso também **na hora**, ao posicionar/ajustar cada item — não acumule \
    bugs pro fim. \
  Em cada pedaço: top-down valida conexão/alinhamento; as 4 laterais validam \
  perfil/altura e que nada flutua/afunda. Mova a câmera entre os playtests \
  (top-down: olhando reto pra baixo, perto; laterais: câmera no eixo X/Z na \
  altura do pedaço, perto). Só conclua quando TODOS os pedaços passarem de perto. \
  NUNCA declare pronto com base em vista 3/4 ou panorâmica — é exatamente assim \
  que a flutuação passa.
- **Crítica de BELEZA contra a referência (obrigatória antes de "pronto").** Além \
dos bugs, avalie a APARÊNCIA vs a referência. Use a tool \`critique_scene\` \
(passe o PNG do \`playtest_game\` em \`screenshot_path\`, a imagem de referência do \
usuário/preview em \`reference_path\`, e o spec em \`goal\`): ela é um crítico de \
"olhos frescos" e devolve a distância visual (N/10) + correções priorizadas \
(atmosfera/luz, densidade, composição, câmera). Você está imerso no contexto e \
tende a achar que ficou bom — o crítico isolado pega o que você não vê. Aplique \
CADA correção (atmosfera quase sempre rende mais que mover peça), rode o playtest \
de novo e re-critique até a distância visual ficar pequena. Não entregue uma cena \
que o crítico (ou você) veria como mais feia/mais vazia que a referência.

Seja conciso. Não repita o que as ferramentas já mostram no output.`

// Anexado ao system prompt só nos turnos em modo PLAN. O agente pesquisa
// read-only e devolve um plano em texto; a implementação só vem depois que o
// usuário aprovar (fluxo por turno — ver ADR-0036).
const PLAN_MODE_PROMPT = `

MODO PLANO (ativo SOMENTE neste turno):
- Você está PLANEJANDO, não implementando. NÃO crie nem edite arquivos e NÃO \
rode comandos que modifiquem o projeto — neste modo qualquer tool que não seja \
de leitura (Read/Glob/Grep) é bloqueada automaticamente.
- Pesquise o necessário (Read/Grep/Glob) e produza, como sua RESPOSTA FINAL em \
texto, um PLANO de implementação claro: objetivo, arquivos a criar/editar, \
passos numerados e pontos de atenção/decisões. Use markdown.
- Seja específico e conciso. Termine com o plano — a implementação acontece \
depois que o usuário aprovar o plano.`

const APPROVED_AUTO_TOOLS = new Set(['Read', 'Glob', 'Grep', 'NotebookRead'])

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ToolRequest {
  id: string
  name: string
  input: Record<string, unknown>
  summary: string
  needsApproval: boolean
}

export interface ToolExecutionResult {
  content: string
  isError: boolean
}

export interface TurnStats {
  /** Duração total do turno em milissegundos. */
  durationMs: number
  /** Custo estimado em USD (já calculado pelo SDK). */
  costUsd: number
  /** Tokens de input enviados (não inclui cache hits). */
  inputTokens: number
  /** Tokens de output gerados. */
  outputTokens: number
  /** Tokens lidos do cache (mais baratos). */
  cacheReadTokens: number
  /**
   * Session ID retornado pelo SDK no `result`. Persistido por projeto e
   * passado como `resume: <id>` nas chamadas seguintes — preserva o
   * contexto da conversa mesmo entre reinicializações do IDE.
   */
  sessionId: string | null
}

export interface AgentEvents {
  onTextChunk(text: string): void
  onToolRequest(request: ToolRequest): void
  onToolExecuted(id: string, result: ToolExecutionResult): void
  onDone(stopReason: string | null, stats: TurnStats | null): void
  onError(err: unknown): void
}

export interface AgentApproval {
  /** Pergunta ao usuário se uma tool destrutiva pode rodar. */
  requestApproval(request: ToolRequest): Promise<boolean>
}

export type AgentMode = 'ask' | 'auto' | 'plan'

export interface RunAgentOptions {
  prompt: string
  projectRoot: string | null
  events: AgentEvents
  approval: AgentApproval
  abortController: AbortController
  /** true no primeiro turno do projeto; demais turnos usam continue:true */
  continueSession: boolean
  /**
   * Session ID a retomar (persistido por projeto entre execuções do IDE).
   * Quando presente, tem precedência sobre `continueSession` e restaura o
   * contexto completo da conversa anterior no backend Claude Code.
   */
  resumeSessionId?: string | null
  /**
   * 'ask' (default): toda tool fora do conjunto auto-aprovado pede confirmação.
   * 'auto': tudo é aprovado direto; cards de tool aparecem só como histórico.
   * 'plan': read-only — toda tool mutante é bloqueada e o agente devolve um
   * plano em texto. A implementação roda num turno seguinte, após aprovação
   * (ADR-0036).
   */
  mode: AgentMode
  /**
   * Conteúdo de `docs/cortex-game-engine/engine-api.md` (catálogo + receitas),
   * empacotado no Studio e injetado no system prompt pra o agente saber o que o
   * engine expõe. Lido pelo main via resourceBase(); vazio se indisponível.
   */
  engineApiDoc?: string
  /**
   * Conteúdo da **Game Design Bible** (`docs/game-design-bible/`, todos os `.md`
   * concatenados) — regras curadas de design de jogos 2.5D/platformer. Injetada
   * no system prompt pra a IA já vir orientada a level/game design. Lida pelo
   * main via resourceBase(); vazia se indisponível.
   */
  gameDesignBible?: string
  /**
   * Tipo do jogo (de `cortex.json`): `2d` (pixel/ortográfica — sprites, tilemap)
   * ou `2.5d` (malhas 3D/perspectiva, default). Orienta o foco do prompt.
   */
  projectType?: '2d' | '2.5d'
  /**
   * Ambiente repassado ao subprocesso do SDK (a tool Bash herda dele). No app
   * empacotado o PATH do processo Electron não inclui yarn/node — o main injeta
   * os diretórios certos via envForSpawn() e passa aqui. Quando omitido, o SDK
   * herda `process.env`. ATENÇÃO: o SDK NÃO faz merge com process.env, então
   * este objeto já deve ser process.env aumentado, não só os extras.
   */
  env?: NodeJS.ProcessEnv
}

/**
 * Roda um turno do agente. `prompt` é só a mensagem atual do usuário;
 * o SDK persiste o histórico por sessão (chave = cwd) quando passamos
 * `continue: true`.
 */
export async function runAgent(opts: RunAgentOptions): Promise<void> {
  // Tools customizadas ficam num MCP server in-process — só carregadas quando
  // há projeto aberto (precisam de projectRoot pra resolver paths relativos).
  const mcpServers = opts.projectRoot
    ? {
        'cortex-blender': createBlenderToolServer(opts.projectRoot),
        'cortex-playtest': createPlaytestToolServer(opts.projectRoot),
        'cortex-assets': createAssetToolServer(opts.projectRoot),
        'cortex-critic': createCriticToolServer(opts.projectRoot),
      }
    : undefined

  // Monta o append do system prompt: base + referência da API do engine
  // (injetada pra o agente saber o que existe) + instruções de plan se for o caso.
  let systemAppend = AGENT_SYSTEM_PROMPT
  if (opts.projectType === '2d') {
    systemAppend +=
      `\n\n===== TIPO DO PROJETO: 2D / PIXEL ART =====\n` +
      `Este é um jogo **2D pixel art** (câmera ortográfica). Use a camada 2D do engine:\n` +
      `- \`new Game({ projection: 'orthographic', pixelsPerUnit })\` — NÃO use câmera perspectiva.\n` +
      `- **Sprites** (\`createSprite\`, \`Spritesheet\` + \`createAnimatedSprite\` + \`SpriteAnimationSystem\`), ` +
      `texturas com \`loadTexture(url, { pixelated: true })\` (nearest filter).\n` +
      `- **Tilemap** (\`buildTilemap\` + \`addColliders\`) pra níveis por tiles.\n` +
      `- NÃO use modelos GLB 3D, iluminação PBR, PostFX 3D, água, skybox nem \`inspect_assets\` ` +
      `de \`.glb\` — isso é do fluxo 2.5D. A física/colisão (Collider2D, setupPlatformer) é a mesma.\n` +
      `Pra criar/animar personagem e montar fases, pense em **spritesheets e tilesets**, não em malhas.`
  } else {
    systemAppend +=
      `\n\n===== TIPO DO PROJETO: 2.5D =====\n` +
      `Jogo 2.5D (malhas 3D / perspectiva). Siga a seção "MONTAGEM DE LEVEL (plataforma 2.5D)" ` +
      `e use modelos GLB + \`inspect_assets\` como de costume.`
  }
  if (opts.engineApiDoc && opts.engineApiDoc.trim().length > 0) {
    systemAppend += `\n\n===== Referência da API do cortex-game-engine =====\n\n${opts.engineApiDoc}`
  }
  if (opts.gameDesignBible && opts.gameDesignBible.trim().length > 0) {
    systemAppend +=
      `\n\n===== GAME DESIGN BIBLE (regras de design — siga ao criar/montar level e gameplay) =====\n\n` +
      opts.gameDesignBible
  }
  if (opts.mode === 'plan') {
    systemAppend += PLAN_MODE_PROMPT
  }

  const queryOptions: Options = {
    cwd: opts.projectRoot ?? undefined,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: systemAppend },
    // resume tem precedência sobre continue. Se temos um sessionId persistido
    // do passado (mesmo projeto, outra sessão do IDE), restauramos a conversa
    // completa no backend. Senão, continue mantém o contexto dentro da mesma
    // sessão do IDE.
    resume: opts.resumeSessionId ?? undefined,
    continue: opts.resumeSessionId ? undefined : opts.continueSession || undefined,
    abortController: opts.abortController,
    // Repassado ao subprocesso do SDK; a tool Bash herda este env (yarn/node).
    env: opts.env as Record<string, string | undefined> | undefined,
    mcpServers,
    canUseTool: async (toolName, input) => {
      // Tools de leitura pura sempre rodam sem perguntar, em qualquer mode.
      if (APPROVED_AUTO_TOOLS.has(toolName)) {
        return { behavior: 'allow', updatedInput: input } as PermissionResult
      }

      // Modo plan: só leitura. Bloqueia qualquer tool que possa modificar o
      // projeto (Write/Edit/Bash/MCP). O agente deve apresentar o plano em
      // texto; a implementação roda no turno seguinte, após aprovação. Não
      // emitimos card (onToolRequest) — a recusa é silenciosa pro usuário.
      if (opts.mode === 'plan') {
        return {
          behavior: 'deny',
          message:
            'MODO PLANO: ações que modificam o projeto estão bloqueadas. ' +
            'Apresente o plano final em texto; a implementação acontece após o usuário aprovar.',
        } as PermissionResult
      }

      const needsApproval = opts.mode === 'ask'
      const request: ToolRequest = {
        id: makeId(),
        name: toolName,
        input,
        summary: buildSummary(toolName, input),
        needsApproval,
      }
      opts.events.onToolRequest(request)

      if (!needsApproval) {
        // Em auto-mode o card aparece no chat só pra histórico; aprovação
        // é implícita e a tool roda imediatamente.
        return { behavior: 'allow', updatedInput: input } as PermissionResult
      }

      const approved = await opts.approval.requestApproval(request)
      if (!approved) {
        const denied: ToolExecutionResult = {
          content: 'Usuário negou esta operação.',
          isError: true,
        }
        opts.events.onToolExecuted(request.id, denied)
        return { behavior: 'deny', message: 'Usuário negou esta operação.' } as PermissionResult
      }
      return { behavior: 'allow', updatedInput: input } as PermissionResult
    },
  }

  try {
    const q = query({ prompt: opts.prompt, options: queryOptions })
    for await (const message of q) {
      handleSdkMessage(message, opts.events)
    }
  } catch (err) {
    opts.events.onError(err)
  }
}

function handleSdkMessage(message: unknown, events: AgentEvents): void {
  const msg = message as { type?: string }
  if (!msg || typeof msg.type !== 'string') return

  switch (msg.type) {
    case 'assistant': {
      const blocks = (msg as { message?: { content?: Array<{ type?: string; text?: string }> } })
        .message?.content
      if (!blocks) return
      for (const block of blocks) {
        if (block.type === 'text' && typeof block.text === 'string') {
          events.onTextChunk(block.text)
        }
      }
      return
    }
    case 'user': {
      // Mensagens 'user' que voltam carregam tool_result blocks da execução
      const blocks = (msg as { message?: { content?: unknown[] } }).message?.content
      if (!Array.isArray(blocks)) return
      for (const block of blocks) {
        const b = block as { type?: string; tool_use_id?: string; content?: unknown; is_error?: boolean }
        if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
          const content = stringifyToolResult(b.content)
          events.onToolExecuted(b.tool_use_id, { content, isError: b.is_error === true })
        }
      }
      return
    }
    case 'result': {
      const m = msg as {
        subtype?: string
        duration_ms?: number
        total_cost_usd?: number
        session_id?: string
        usage?: {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
        }
      }
      const stats: TurnStats | null =
        typeof m.duration_ms === 'number'
          ? {
              durationMs: m.duration_ms,
              costUsd: typeof m.total_cost_usd === 'number' ? m.total_cost_usd : 0,
              inputTokens: m.usage?.input_tokens ?? 0,
              outputTokens: m.usage?.output_tokens ?? 0,
              cacheReadTokens: m.usage?.cache_read_input_tokens ?? 0,
              sessionId: typeof m.session_id === 'string' ? m.session_id : null,
            }
          : null
      events.onDone(m.subtype ?? null, stats)
      return
    }
    default:
      return
  }
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const block = b as { type?: string; text?: string }
        if (block.type === 'text' && typeof block.text === 'string') return block.text
        return JSON.stringify(b)
      })
      .join('\n')
  }
  return JSON.stringify(content)
}

function buildSummary(toolName: string, input: Record<string, unknown>): string {
  const path = typeof input['file_path'] === 'string' ? input['file_path'] : ''
  const command = typeof input['command'] === 'string' ? input['command'] : ''
  switch (toolName) {
    case 'Write':
      return `Criar/sobrescrever ${path}`
    case 'Edit':
      return `Editar ${path}`
    case 'NotebookEdit':
      return `Editar notebook ${path}`
    case 'Bash':
      return `Executar: ${command}`
  }
  // Tools de MCP servers chegam prefixadas como mcp__<server>__<tool>
  if (toolName.endsWith('generate_blender_model')) {
    const target = typeof input['target_path'] === 'string' ? input['target_path'] : ''
    const desc = typeof input['description'] === 'string' ? input['description'] : ''
    const short = desc.length > 60 ? `${desc.slice(0, 60)}…` : desc
    return `Gerar modelo 3D em ${target}: "${short}"`
  }
  return toolName
}

function makeId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
