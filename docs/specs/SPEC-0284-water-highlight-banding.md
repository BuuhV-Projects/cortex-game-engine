# SPEC-0284 — Brilho da água sem faixas repetidas

**Data:** 2026-09-28
**Status:** implementado

As duas senoides de alta frequência nas normais formam listras regulares de
brilho. Substituir esse detalhe por ruído suave, de baixa amplitude, em
coordenadas mundiais, atenuado com a distância da câmera. Remover também a
variação de cor vinculada a uma única senoide. Preservar o deslocamento das
ondas principais, a espuma de contato e os impactos locais. Não adicionar
passes nem texturas externas. Validar o shader e comparar uma captura nativa
na mesma vista das ilhas, além do build e das regressões da água.

## Validação

Build e typecheck da engine passaram; 64 testes de água/cena passaram. Captura
nativa na mesma câmera confirmou a remoção das listras curtas regulares,
preservando a espuma nas margens. Sem erros WebGPU. O deslocamento geométrico
das ondas principais mantém as mesmas fórmulas e parâmetros.
