# 0004 - Geração de modelos 3D via Claude + Blender CLI

**Data:** 2026-05-24
**Status:** aceito

## Contexto

O PRD exige que a IA possa criar modelos 3D do Blender. As abordagens avaliadas foram:

- **Text-to-3D direto (Shap-E, TripoSR, etc.)**: modelos de difusão especializados em 3D. Requerem GPU local ou API paga extra; saída é mesh genérica sem rig nem materiais nomeados de forma útil para jogos.
- **Geração de código Python para Blender**: o Blender expõe toda sua API via Python (`bpy`). É possível gerar um script Python que cria qualquer geometria, material e exporta como `.glb`. Esse script pode ser executado via `blender --background --python script.py`.
- **Blender MCP / plugin de IA**: soluções emergentes, instáveis, sem API padronizada.

## Decisão

Usar **Claude API para gerar scripts Python do Blender**, executados via **Blender CLI** no módulo `src/ai/BlenderModelGenerator.js`.

Fluxo:
1. O usuário descreve o modelo em linguagem natural (ex: "uma espada medieval com lâmina metálica e cabo de madeira").
2. `BlenderModelGenerator` envia a descrição ao Claude com um system prompt que documenta a API `bpy` relevante (geometria, materiais PBR, exportação GLTF) — também com prompt caching (ADR-0003).
3. Claude retorna um script Python válido para `bpy`.
4. O módulo salva o script em arquivo temporário e executa `blender --background --python <script>` via `child_process.spawn`.
5. O script Python exporta o resultado como `.glb` no diretório de saída especificado.
6. O `.glb` é carregável diretamente pelo `AssetLoader` do motor (ADR-0001).

**Pré-requisito**: Blender instalado e disponível no `PATH` (variável `BLENDER_PATH` substitui o padrão).

## Consequências

- **Positivo**: GLTF/GLB é o formato nativo do Three.js — integração perfeita com o motor.
- **Positivo**: scripts Python do Blender são determinísticos; o usuário pode inspecionar, editar e re-executar manualmente.
- **Negativo**: requer Blender instalado localmente; sem Blender, o módulo falha com erro descritivo.
- **Negativo**: modelos muito complexos podem exigir ajuste manual no Blender; a IA não garante topologia ideal para games.
- **Negativo**: tempo de execução do Blender CLI pode ser de vários segundos; não adequado para uso em tempo real durante o jogo.
