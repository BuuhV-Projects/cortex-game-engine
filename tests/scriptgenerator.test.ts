/**
 * Testes unitários para ScriptGenerator (src/ai/ScriptGenerator.ts)
 * Cobre: extração de bloco js, erros esperados e comportamento sem API key.
 * Usa vi.mock para isolar @anthropic-ai/sdk e o módulo de auth.
 * Referência: ADR-0003.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoistados antes dos imports) ────────────────────────────────────

// Suprime a verificação de credenciais para que o módulo possa ser importado
vi.mock('../src/ai/auth.js');

// vi.hoisted garante que a variável seja criada antes da hoisting do vi.mock
const mockMessagesCreate = vi.hoisted(() => vi.fn());

// O mock usa uma função regular (não arrow) para que `new Anthropic()` funcione
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function AnthropicMock() {
    return { messages: { create: mockMessagesCreate } };
  }),
}));

// ── Importações após mocks ─────────────────────────────────────────────────
import { ScriptGenerator } from '../src/ai/ScriptGenerator.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Cria uma resposta mock da Claude API com o texto fornecido. */
function makeApiResponse(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
  };
}

// ─── Testes principais ─────────────────────────────────────────────────────

describe('ScriptGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['ANTHROPIC_API_KEY'] = 'sk-test-key';
  });

  afterEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
  });

  // ── extração de bloco js ──────────────────────────────────────────────────

  describe('extração de bloco js', () => {
    it('retorna o código extraído do bloco ```js``` da resposta', async () => {
      mockMessagesCreate.mockResolvedValueOnce(
        makeApiResponse(
          'Aqui está o script ECS.\n\n```js\nconsole.log("hello world");\n```',
        ),
      );

      const gen = new ScriptGenerator();
      const result = await gen.generate('script simples');
      expect(result.code).toBe('console.log("hello world");');
    });

    it('retorna a explicação (texto que antecede o bloco ```js```)', async () => {
      mockMessagesCreate.mockResolvedValueOnce(
        makeApiResponse('Este script move o player.\n\n```js\nconst x = 1;\n```'),
      );

      const gen = new ScriptGenerator();
      const result = await gen.generate('mover player');
      expect(result.explanation).toBe('Este script move o player.');
    });

    it('retorna explanation vazio quando não há texto antes do bloco', async () => {
      mockMessagesCreate.mockResolvedValueOnce(
        makeApiResponse('```js\nconst x = 1;\n```'),
      );

      const gen = new ScriptGenerator();
      const result = await gen.generate('só código');
      expect(result.explanation).toBe('');
    });

    it('lança erro descritivo quando a resposta não contém bloco ```js```', async () => {
      mockMessagesCreate.mockResolvedValueOnce(
        makeApiResponse('Resposta sem código JavaScript.'),
      );

      const gen = new ScriptGenerator();
      await expect(gen.generate('algo')).rejects.toThrow(
        'bloco de código JavaScript válido',
      );
    });

    it('lança erro quando o código gerado contém erro de sintaxe', async () => {
      mockMessagesCreate.mockResolvedValueOnce(
        makeApiResponse('```js\nfunction invalid({\n```'),
      );

      const gen = new ScriptGenerator();
      await expect(gen.generate('código ruim')).rejects.toThrow('sintaxe');
    });
  });

  // ── chamada à Claude API ───────────────────────────────────────────────────

  describe('chamada à Claude API', () => {
    it('envia a descrição do usuário como mensagem de role user', async () => {
      mockMessagesCreate.mockResolvedValueOnce(
        makeApiResponse('```js\nconst x = 1;\n```'),
      );

      const gen = new ScriptGenerator();
      await gen.generate('sistema de pulo do player');

      const [callArg] = mockMessagesCreate.mock.calls[0] as [Record<string, unknown>];
      const messages = callArg['messages'] as Array<{ role: string; content: string }>;
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('sistema de pulo do player');
    });

    it('envia system prompt com cache_control ephemeral (prompt caching — ADR-0003)', async () => {
      mockMessagesCreate.mockResolvedValueOnce(
        makeApiResponse('```js\nconst x = 1;\n```'),
      );

      const gen = new ScriptGenerator();
      await gen.generate('teste de cache');

      const [callArg] = mockMessagesCreate.mock.calls[0] as [Record<string, unknown>];
      const system = callArg['system'] as Array<{ cache_control: unknown }>;
      expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('propaga erros lançados pelo SDK (ex: falha de rede)', async () => {
      mockMessagesCreate.mockRejectedValueOnce(new Error('Network error'));

      const gen = new ScriptGenerator();
      await expect(gen.generate('qualquer')).rejects.toThrow('Network error');
    });
  });
});

// ─── Teste de erro sem API key ─────────────────────────────────────────────

describe('ScriptGenerator - erro sem API key', () => {
  it('módulo de auth lança erro descritivo quando não há credenciais disponíveis', async () => {
    const savedKey = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];

    // Reseta o cache de módulos e remove o mock de auth para que o real seja carregado
    vi.resetModules();
    vi.doUnmock('../src/ai/auth.js');

    // Simula ausência do arquivo de credenciais do Claude Code (~/.claude/.credentials.json)
    vi.doMock('node:fs', () => ({
      existsSync: vi.fn().mockReturnValue(false),
      default: { existsSync: vi.fn().mockReturnValue(false) },
    }));
    vi.doMock('node:os', () => ({
      homedir: vi.fn().mockReturnValue('/nonexistent/home'),
      default: { homedir: vi.fn().mockReturnValue('/nonexistent/home') },
    }));

    let thrownError: unknown;
    try {
      // Importação dinâmica após vi.doUnmock → carrega o auth.ts real, que deve lançar
      await import('../src/ai/auth.js');
    } catch (err) {
      thrownError = err;
    } finally {
      if (savedKey !== undefined) {
        process.env['ANTHROPIC_API_KEY'] = savedKey;
      }
      // Restaura o estado original dos módulos para não contaminar outros testes
      vi.resetModules();
      vi.doUnmock('node:fs');
      vi.doUnmock('node:os');
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toContain('credencial');
  });
});
