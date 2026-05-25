import './auth.js'; // Garante que a checagem de autenticação seja feita ao importar este módulo
import Anthropic from '@anthropic-ai/sdk';

// ─── System prompt (cacheado via cache_control ephemeral) ─────────────────────

const ECS_SYSTEM_PROMPT = `\
Você é um assistente especializado em geração de scripts JavaScript para um motor de jogo \
com arquitetura Entity-Component-System (ECS).

## Referência da API ECS

### Entity
Representa um objeto de jogo com UUID único.

\`\`\`js
// Criar entity (via World)
const entity = world.createEntity();

// Gerenciar componentes
entity.addComponent(new MyComponent()); // adiciona/substitui componente
entity.removeComponent(MyComponent);   // remove pelo construtor
entity.getComponent(MyComponent);      // retorna instância ou undefined
entity.hasComponent(MyComponent);      // retorna boolean
entity.getAllComponents();             // retorna Component[]

// ID único
entity.id; // string UUID (gerado com crypto.randomUUID())
\`\`\`

### Component
Classe base para contêineres de dados. Subclasses devem conter **apenas dados**, sem lógica.

\`\`\`js
class PositionComponent extends Component {
  constructor(x = 0, y = 0, z = 0) {
    super();
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

comp.enabled; // boolean — systems podem ignorar componentes desativados
comp.type;    // string — nome da classe, ex: "PositionComponent"
\`\`\`

### System
Classe base para lógica. Subclasses implementam \`update(entities, deltaTime)\`.

\`\`\`js
class MovementSystem extends System {
  // Declara quais tipos de componente este system requer
  static requiredComponents = [PositionComponent, VelocityComponent];

  // priority: valores menores executam primeiro (padrão: 0)
  constructor() {
    super();
    this.priority = 0;
  }

  // entities: apenas as que possuem TODOS os requiredComponents
  // deltaTime: tempo decorrido em milissegundos
  update(entities, deltaTime) {
    for (const entity of entities) {
      const pos = entity.getComponent(PositionComponent);
      const vel = entity.getComponent(VelocityComponent);
      pos.x += vel.x * deltaTime;
      pos.y += vel.y * deltaTime;
      pos.z += vel.z * deltaTime;
    }
  }
}
\`\`\`

### World
Registro central que gerencia entities e systems.

\`\`\`js
const world = new World();

// Gerenciamento de entities
const entity = world.createEntity();  // cria, registra e retorna Entity
world.destroyEntity(entity);          // remove entity do world

// Gerenciamento de systems
world.addSystem(new MovementSystem()); // registra system (ordenado por priority)
world.removeSystem(MovementSystem);   // remove primeiro system do tipo dado

// Consulta de entities
const entities = world.query(PositionComponent, VelocityComponent);
// retorna Entity[] que possuem TODOS os componentes especificados

// Executa um tick de simulação
world.tick(deltaTime); // chama update() em todos os systems por ordem de priority
\`\`\`

## Formato da resposta

Sempre responda com:
1. Uma explicação breve do que o script faz.
2. O script completo em um único bloco de código JavaScript (\`\`\`js ... \`\`\`).

O script deve definir as classes Component e System necessárias e incluir comentários \
que orientem o usuário sobre como integrá-lo ao motor de jogo.`;

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Resultado retornado por {@link ScriptGenerator.generate}. */
export interface GenerateResult {
  /** Código JavaScript extraído do bloco \`\`\`js da resposta da IA. */
  code: string;
  /** Explicação em texto livre que antecede o bloco de código na resposta. */
  explanation: string;
}

// ─── ScriptGenerator ─────────────────────────────────────────────────────────

/**
 * Gera scripts JavaScript compatíveis com o ECS do motor usando a Claude API.
 *
 * @example
 * const gen = new ScriptGenerator();
 * const { code, explanation } = await gen.generate(
 *   'Sistema que faz o player pular ao pressionar a barra de espaço'
 * );
 *
 * @see ADR-0003
 */
export class ScriptGenerator {
  private readonly _client: Anthropic;

  /**
   * Cria uma instância de ScriptGenerator.
   *
   * @throws {Error} Se a variável de ambiente `ANTHROPIC_API_KEY` não estiver definida.
   */
  constructor() {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    this._client = new Anthropic({ apiKey });
  }

  /**
   * Gera um script ECS a partir de uma descrição em linguagem natural.
   *
   * O system prompt (com a documentação da API ECS) é enviado com
   * `cache_control: { type: "ephemeral" }` para aproveitar prompt caching
   * em chamadas repetidas — vide ADR-0003.
   *
   * @param description - Descrição em linguagem natural do comportamento desejado.
   * @returns Objeto com `{ code, explanation }`.
   * @throws {Error} Se a API não retornar um bloco ```js válido.
   * @throws {Error} Se o código gerado contiver erro de sintaxe.
   */
  async generate(description: string): Promise<GenerateResult> {
    const response = await this._client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: ECS_SYSTEM_PROMPT,
          // Cache o system prompt para reduzir latência e custo em chamadas repetidas
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: description }],
    });

    // Concatena todos os blocos de texto da resposta
    const fullText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Extrai o primeiro bloco ```js ... ``` da resposta
    const codeMatch = /```js\s*([\s\S]*?)```/.exec(fullText);
    if (codeMatch === null || !codeMatch[1]) {
      throw new Error(
        'A IA não retornou um bloco de código JavaScript válido (```js ... ```). ' +
          'Tente reformular a descrição.',
      );
    }

    const code = codeMatch[1].trim();

    // Valida sintaxe com new Function() — detecta erros de sintaxe, não semânticos
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      new Function(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `O código gerado pela IA contém um erro de sintaxe JavaScript: ${message}\n\n` +
          `Código gerado:\n${code}`,
      );
    }

    // A explicação é o texto antes do primeiro bloco ```js
    const codeBlockIndex = fullText.indexOf('```js');
    const explanation = (codeBlockIndex > 0 ? fullText.slice(0, codeBlockIndex) : '').trim();

    return { code, explanation };
  }
}
