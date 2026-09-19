# SPEC-0195 — Superfícies brilhantes no toon e orientação do céu

## Contexto

A captura do Circuito Capital mostra o céu acinzentado e veículos sem reflexos.
O gradiente escreve o zênite na primeira linha, mas `equirectUV` mapeia a direção
Y positiva para V=1: com DataTexture/flipY=false essa direção lê a última linha.
O preset toon substitui também os materiais reflexivos originais do GLB.

## Comportamento

- Skybox.fromGradient grava nadir em V=0 e zênite em V=1. O horizonte continua
  em V=0.5. Corrigir teste para amostrar pela direção equiretangular.
- O panorama deve ser 2:1 (largura = 2 × altura), com altura mínima de 32. O
  PMREM calcula o cubo por `image.width / 4`; a antiga textura 1×N resultava em
  cubo de 0.25 pixels e LOD inválido. Repetir a mesma cor em toda a linha mantém
  o gradiente sem emenda e fornece dimensões válidas para reflexos PBR.
- Toon ganha `preserveGloss?: boolean`, default false. Quando true, materiais
  MeshStandardMaterial/Physical com metalness >= 0.2 ou roughness <= 0.35 usam
  clone do PBR original. Superfícies foscas continuam no toon selecionado.
- A opção preserva reflexos reais, mapas, transparência, nomes e personalização
  da pintura; a cor opcional do preset também se aplica ao clone PBR. Contornos
  continuam sendo gerados pelo preset toon. Texturas originais são compartilhadas.
- Expor `Preservar brilho` no Inspector e aceitar o campo no schema da cena.
  Não adicionar um shader paralelo ao jogo. ClearMaterial restaura o original.
- Habilitar nos dois carros e rodas herdadas do kart-racer, preservando overrides
  de material e transforms existentes. O ambiente de reflexão usa o céu corrigido.

## Validação

Regressão de orientação pelas coordenadas equiretangulares, seleção de superfícies
PBR/foscas, restauração e pintura; testes de materiais/Inspector e corrida.
Gerar API e revendorizar após compilar somente a engine. Revisão GPU pendente
caso o controle de computador continue indisponível.
