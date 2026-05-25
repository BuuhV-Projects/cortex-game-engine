#!/usr/bin/env node

/**
 * CLI principal do jsgame-ai.
 *
 * Comandos disponíveis:
 *  - generate-script <description>  Gera script ECS via Claude (ADR-0003)
 *  - generate-model  <description>  Gera modelo 3D (.glb) via Claude + Blender (ADR-0004)
 */

import { program } from 'commander';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ScriptGenerator } from '../ai/ScriptGenerator.js';
import { BlenderModelGenerator } from '../ai/BlenderModelGenerator.js';

// ─── Metadados ────────────────────────────────────────────────────────────────

program
  .name('jsgame-ai')
  .description('Motor de jogo 3D — ferramentas de geração por IA')
  .version('0.1.0');

// ─── generate-script ─────────────────────────────────────────────────────────

program
  .command('generate-script')
  .description(
    'Gera um script ECS em JavaScript a partir de uma descrição em linguagem natural',
  )
  .argument('<description>', 'Descrição do comportamento desejado (entre aspas)')
  .option('-o, --output <file>', 'Salvar o código gerado neste arquivo')
  .action(async (description: string, options: { output?: string }) => {
    try {
      console.log('⏳ Gerando script ECS...\n');

      const gen = new ScriptGenerator();
      const { code, explanation } = await gen.generate(description);

      if (explanation) {
        console.log('─── Explicação ───────────────────────────────────────────\n');
        console.log(explanation);
      }

      console.log('─── Código gerado ────────────────────────────────────────\n');
      console.log('```js');
      console.log(code);
      console.log('```');

      if (options.output) {
        await writeFile(options.output, code, 'utf-8');
        console.log(`\n✅ Código salvo em: ${options.output}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n❌ Erro ao gerar script: ${message}`);
      process.exit(1);
    }
  });

// ─── generate-model ───────────────────────────────────────────────────────────

program
  .command('generate-model')
  .description(
    'Gera um modelo 3D (.glb) via Claude + Blender CLI a partir de uma descrição em linguagem natural',
  )
  .argument('<description>', 'Descrição do modelo desejado (entre aspas)')
  .option('-o, --output <dir>', 'Diretório de saída para o arquivo .glb', '.')
  .action(async (description: string, options: { output: string }) => {
    try {
      console.log('⏳ Gerando modelo 3D...\n');

      // Deriva um nome de arquivo a partir da descrição (sanitizado, máx. 50 chars)
      const sanitized = description
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 50);
      const filename = sanitized.length > 0 ? sanitized : 'model';
      const outputPath = join(options.output, `${filename}.glb`);

      const gen = new BlenderModelGenerator();
      const { glbPath, scriptPath } = await gen.generate(description, outputPath);

      console.log('\n✅ Modelo gerado com sucesso!');
      console.log(`   📦 Modelo (.glb) : ${glbPath}`);
      console.log(`   📄 Script Python  : ${scriptPath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n❌ Erro ao gerar modelo: ${message}`);
      process.exit(1);
    }
  });

// ─── Parse ────────────────────────────────────────────────────────────────────

program.parse();
