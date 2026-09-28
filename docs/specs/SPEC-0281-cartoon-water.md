# SPEC-0281 — Superfície cartoon e ondulações locais

**Data:** 2026-09-28
**Status:** implementado

**Evolução:** a SPEC-0283 substitui a espuma de superfície por espuma restrita
ao contato com as margens; as medidas abaixo descrevem a primeira versão.

## Contexto

Implementação do ADR-0280, preservando a API Water simples e a autoria em JSON.

## Comportamento

- `style: cartoon` ativa malha subdividida e material TSL com ondas analíticas,
  normais animadas, cores turquesa, brilho do céu e manchas de espuma transitórias.
- `waveHeight`, `waveLength`, `waveSpeed`, `foamStrength` e `segments` são dados
  opcionais do nó; defaults ficam centralizados no material. A cena simples não muda.
- As ondas usam coordenadas do mundo; acompanhar a câmera não arrasta o padrão.
- `Water.addRipple({ x, z }, strength)` registra uma perturbação em coordenadas
  do mundo; oito slots fixos, substituição circular, sem alocar malhas ou materiais.
- Os eventos expiram, têm alcance limitado e não executam simulação de volume.
- A água não entra na fusão estática, não projeta sombra e sua caixa de visibilidade
  inclui a amplitude das ondas. Materiais nascem antes do aquecimento de pipelines.
- O jogo de kart substitui seu GLB de oceano por um nó de água com o mesmo ID.
- O host deve expor `GPUTexture.format` com o formato real, inclusive HDR,
  para a geração de mipmaps manter render bundles compatíveis com seus alvos.
- Validação: regressão da água simples, pool e schema, compilação de shader,
  inspeção visual e execução no host nativo, com registro do custo quando disponível.

## Limites

Espuma automática nas margens, transparência por profundidade, reflexo planar e
spray de partículas não fazem parte desta etapa. A espuma decorativa existente
do cenário permanece. Não há necessidade de Blender para a superfície animada.

## Validação em 2026-09-28

- 59 testes de água, SceneBuilder, validação de cena e fusão estática passaram.
- Typecheck e build da engine passaram; documentação gerada sem erros.
- Host C++ recompilado; 403 verificações nativas passaram, incluindo a regressão
  da conversão de formatos HDR usada pelos bundles de mipmaps.
- Shader compilado e renderizado no host nativo, com inspeção da espuma irregular
  e dos anéis locais no exemplo `examples/cartoon-water`.
- Comparação local a 1280×720, mesmo exemplo/câmera, 1.200 quadros por execução:
  mediana de quadro de 13,3 ms no modo simples e 13,4 ms no cartoon; CPU de render
  mediana de 1,6 ms em ambos. Foram 29 amostras após descartar os primeiros 3 s.
  Ambos registraram 11 chamadas de desenho, incluindo marcador e HUD; a cena
  passou de 978 para 33.744 triângulos. O cartoon estava emitindo perturbações.
- Essas medidas estão limitadas pelo ritmo de apresentação (~75 Hz), não isolam
  tempo de GPU e não representam um orçamento garantido em outras máquinas.
  Traces locais: `.cortex/water-bench-{simple,cartoon}/perf-trace.jsonl`.

As oito contribuições locais são avaliadas pelo shader nos pixels da superfície;
o alcance visual é limitado, mas não há despacho de computação apenas na região
do impacto. Esta etapa não implementa simulação de fluido.
