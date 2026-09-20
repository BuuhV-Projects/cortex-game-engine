/**
 * Testes do system prompt do Chat IA (ADR-0180 / SPEC-0181).
 *
 * O prompt guarda só o invariante — o método mora nas skills do plugin. Estes
 * testes travam as duas pontas: o que TEM que estar lá (regras que, se caírem,
 * quebram o jogo do usuário em silêncio) e o que NÃO pode voltar (o método de
 * montagem de fase e o foco 2.5D, que inflavam todo turno).
 */
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../../electron/agent/prompt.js'

const ask = () => buildSystemPrompt({ mode: 'ask' })

describe('buildSystemPrompt — invariantes', () => {
  it('estabelece identidade 3D e resposta em português', () => {
    const p = ask()
    expect(p).toContain('cortex-game-engine')
    expect(p).toContain('Entity-Component-System')
    expect(p).toMatch(/Responda em \*\*português\*\*/)
  })

  it('mantém a sandbox de escrita no projeto aberto', () => {
    expect(ask()).toMatch(/Escrita só dentro do projeto aberto/)
  })

  it('manda ler o AGENTS.md do projeto antes de mexer em cena/física/imports', () => {
    // Os contratos (física no nó, place por bbox, id não-sequencial, import da
    // engine) saíram do prompt e viraram o AGENTS.md do projeto (ADR-0191). O que
    // o prompt precisa garantir é que o agente vá LER esse arquivo.
    const p = ask()
    expect(p).toContain('AGENTS.md')
    expect(p).toMatch(/antes de mexer em cena, física ou imports/i)
    expect(p).toMatch(/SILÊNCIO/)
  })

  it('não carrega mais os comandos proibidos (foram pro AGENTS.md do projeto)', () => {
    // Regra de projeto, não invariante do IDE — ver ADR-0191 e o teste do
    // template em templates-agents.test.ts, que cobre o conteúdo.
    const p = ask()
    expect(p).not.toContain('yarn build')
    expect(p).not.toContain('vite build')
  })

  it('exige validate_scene antes da validação visual', () => {
    const p = ask()
    expect(p).toContain('validate_scene')
    expect(p).toContain('playtest_game')
    expect(p).toMatch(/0 erros ANTES de qualquer imagem/)
  })

  it('aponta para as skills e para o subagente, com as variáveis de caminho', () => {
    const p = ask()
    expect(p).toContain('cortex-studio:level-builder')
    expect(p).toContain('$CORTEX_PLUGIN_DIR')
    expect(p).toContain('$CORTEX_KITS_DIR')
  })
})

describe('buildSystemPrompt — o que não pode voltar', () => {
  it('não trata 2.5D como foco da engine', () => {
    const p = ask()
    expect(p).not.toMatch(/MONTAGEM DE LEVEL/)
    expect(p).not.toMatch(/foco deste engine é/i)
    // A identidade 3D continua no prompt (primeira linha); o detalhamento de
    // estilos 2D/2.5D saiu no ADR-0191.
    expect(p).toMatch(/motor de jogos \*\*3D\*\*/)
  })

  it('não carrega o método de montagem de fase (isso é skill)', () => {
    const p = ask()
    for (const trecho of ['Game Design Bible', 'critique_scene', 'inspect_assets', 'import_kit']) {
      expect(p).not.toContain(trecho)
    }
  })

  it('não menciona o ciclo de aprendizado removido', () => {
    const p = ask()
    for (const trecho of ['save_baseline', 'diff_corrections', 'save_rule', 'scene-learnings']) {
      expect(p).not.toContain(trecho)
    }
  })

  it('cabe no orçamento de contexto de um prompt base', () => {
    // ~380 linhas antes do ADR-0180; o teto trava a regressão silenciosa.
    expect(ask().split('\n').length).toBeLessThan(180)
  })
})

describe('buildSystemPrompt — composição por turno', () => {
  it('anexa as instruções de plano só no modo plan', () => {
    expect(buildSystemPrompt({ mode: 'plan' })).toContain('MODO PLANO')
    expect(ask()).not.toContain('MODO PLANO')
    expect(buildSystemPrompt({ mode: 'auto' })).not.toContain('MODO PLANO')
  })

  it('injeta o ÍNDICE da API quando há caminho do doc (ADR-0114)', () => {
    const doc = '# API\n\n## Core\n\n| Símbolo | O que é |\n|---|---|\n| `Game` | Facade. |\n'
    const p = buildSystemPrompt({ mode: 'ask', engineApiDoc: doc, engineApiPath: '/abs/engine-api.md' })
    expect(p).toContain('ÍNDICE — leia seções sob demanda')
    expect(p).toContain('/abs/engine-api.md')
  })

  it('injeta o doc inteiro como fallback quando não há caminho', () => {
    const doc = '# API\n\nconteúdo integral do catálogo'
    const p = buildSystemPrompt({ mode: 'ask', engineApiDoc: doc })
    expect(p).toContain('conteúdo integral do catálogo')
    expect(p).not.toContain('ÍNDICE — leia seções sob demanda')
  })

  it('omite a seção da API quando o doc não está disponível', () => {
    expect(buildSystemPrompt({ mode: 'ask', engineApiDoc: '   ' })).not.toContain(
      'Referência da API do cortex-game-engine =====',
    )
  })
})

describe('buildSystemPrompt — modelos 3D (SPEC-0224)', () => {
  it('ensina que o custo é material, não triângulo', () => {
    const p = ask()
    expect(p).toContain('custo é material, não triângulo')
    expect(p).toContain('por draw call')
    // O contraponto importa tanto quanto a regra: pedir "low poly" a um gerador
    // otimizaria a coisa errada, porque quem tem folga é a GPU.
    expect(p).toContain('low poly')
  })

  it('dá os tetos de material que o gerador precisa receber no briefing', () => {
    const p = ask()
    expect(p).toContain('mesmo acabamento')
    expect(p).toContain('**4 materiais**')
    expect(p).toContain('**8**')
  })

  it('manda contar materiais antes de culpar a geometria', () => {
    expect(ask()).toContain('materiais por primitiva')
  })
})
