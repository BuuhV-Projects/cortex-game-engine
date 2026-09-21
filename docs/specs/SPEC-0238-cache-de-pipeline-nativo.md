# 0238 - Cache de pipeline nativo (M2 do ADR-0237)

**Data:** 2026-09-21
**Status:** parcial — passos 1 a 4 feitos; o 5 depende do M5

## Contexto

O M1 entregou a descrição de material como dado (89,3% da cena). O M2 é o
primeiro passo que produz objeto de GPU a partir dela: `MaterialDesc` + layout
de vértice → `WGPURenderPipeline`, com cache.

**Critério do marco (ADR-0237):** nenhum pipeline criado por frame em regime.

## Ordem de execução (o risco vem primeiro)

A ordem abaixo não é a natural — é a que descobre cedo o que pode derrubar o
desenho inteiro.

### Passo 1 — provar `override` no naga/D3D12 ANTES de desenhar o resto

A ideia natural é um **uber-shader** com `override` constants (constantes de
especialização) escolhendo modelo de sombreamento, textura e extrusão de
contorno. Só que **nenhum shader do host usa `override` hoje** (splash, bloom e
supersample não usam), e existe precedente ruim: o naga **miscompilou
`COLOR_0`** em `MeshStandardMaterial` — compilou sem erro e renderizou
**branco**, e a saída foi dropar o atributo.

Ou seja: neste backend, **"compilou" não é prova**. Antes de montar a chave do
cache em cima de `override`, um spike compila um WGSL mínimo com duas
constantes e confere o resultado **visualmente**, não pelo código de retorno.

- **Se `override` funcionar:** segue o uber-shader.
- **Se não:** o fallback é um arquivo WGSL por variante — decidido agora, e não
  como reação depois de investir no caminho errado.

### Passo 2 — contar as combinações reais da cena

Quantos pipelines distintos a cena de 271 materiais realmente gera? Pode ser
uma dúzia ou pode ser oitenta, e isso muda o peso do problema seguinte
(compilação de shader no primeiro frame). É medição de minutos, sem tocar em
GPU.

### Passo 3 — a chave, com a separação que importa

Duas decisões **independentes**, que é fácil confundir:

| campo | entra na chave? | é `override` no WGSL? |
| --- | --- | --- |
| modelo de sombreamento | sim | sim |
| contorno (extrusão) | sim | sim |
| tem textura base | sim | sim |
| `toneMapped` | sim | sim (branch no fragmento) |
| **`doubleSided`** | **sim** | **não** — é `cullMode`, estado do pipeline |
| blend | sim | não — é `ColorTargetState` |
| formato do alvo | sim | não |
| layout de vértice | sim | não |
| cor, opacidade, metálico, rugosidade, emissivo, espessura | **não** | não — são **uniforms** |

Pôr cor na chave multiplicaria pipelines por instância de cor, que é
exatamente o problema que este marco existe para evitar.

A chave é uma tupla empacotada em `uint64_t`: comparável e hasheável sem heap.

### Passo 4 — uber-shader (ou variantes) + cache

### Passo 5 — provar o critério

Contador de criação de pipeline, rodando a cena real: o número tem de ser igual
ao de **chaves distintas**, e não crescer por frame.

## O que entra no CI e o que é local (declarado, não omitido)

O harness nativo **não tem device wgpu**, e isso não vai mudar neste marco.
Portanto:

- **No CI** (vitest + harness C++): a função pura `MaterialDesc → PipelineKey`,
  o empacotamento/desempacotamento da chave, a contagem de combinações e a
  lógica de cache (acerto/erro) com um pipeline **falso**.
- **Local, e assumido como tal:** a compilação real do shader no naga/D3D12
  (passo 1) e a prova de "nenhum pipeline por frame" (passo 5). São testes de
  integração com GPU, e o repositório não tem runner com placa. Fica registrado
  como decisão, para não virar dívida silenciosa.

## O que este marco NÃO promete

**Hitch de compilação no carregamento.** Cada pipeline novo compila shader no
driver, e a primeira vez que cada um aparece custa. Isso é real, mas o critério
do M2 é "não recriar por frame" — pré-aquecimento é assunto do marco de
submissão (M5). A contagem do passo 2 fica registrada como entrada para lá.

## Resultados (21/09/2026)

### Passo 1 — `override` FUNCIONA no naga/D3D12

`native/src/webgpu/override_probe.cpp`, ligado por `CORTEX_OVERRIDE_PROBE=1`:
compila um WGSL com uma constante de especialização, desenha num alvo de 1x1 e
**lê o pixel de volta**.

```
[override-probe] vermelho lido=191 esperado=191 (default do shader seria 0)
[override-probe] RESULTADO: override FUNCIONA no naga/D3D12
```

O default do shader é 0: se o naga tivesse ignorado a constante, o pixel sairia
preto. Ele saiu com o valor pedido. **O uber-shader está liberado e o fallback
por arquivo não é necessário** — e agora isso é fato verificado, não suposição,
que era exatamente a diferença que o precedente do `COLOR_0` impôs.

### Passo 2 — a explosão combinatória não existe: são 5 pipelines

Contados na cena real (242 materiais descritos): **5 chaves distintas**.

| modelo | materiais |
| --- | --- |
| contorno | 122 |
| toon | 115 |
| standard | 5 |

O receio de 50-80 pipelines, levantado no debate, não se confirma. Com layout
de vértice e formato do alvo entrando na chave o número sobe, mas parte de 5 —
e **compilação de shader no carregamento deixa de ser assunto**.

Este é o piso: layout e formato ainda não são catalogados.

### Passos 3 e 4 — chave e cache

- `src/render/PipelineKey.ts` — empacota a chave, 4 testes. O que importa é o
  que prova que **dois materiais de cores diferentes caem na mesma chave**.
- `native/src/render/pipeline_cache.h` — cache por chave, 4 testes no harness
  nativo (sem device, com handle falso). Um deles é o critério do marco escrito
  como teste: depois do primeiro frame, um frame inteiro cria **zero** pipeline.

### Passo 5 — o que falta, e por quê

A prova com device real (contar criações na cena viva) **só faz sentido depois
do M5**: enquanto a submissão não for nativa, nada desenha pelo caminho novo e
não há regime para medir. Fica explicitamente pendente, e não dado como feito.
