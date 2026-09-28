# ADR-0280 — Água cartoon na GPU com perturbações locais

**Data:** 2026-09-28
**Status:** aceito

## Contexto

O jogo de kart precisa de água turquesa animada, com ondulações, brilho e espuma,
inspirada visualmente na referência de Ace Angler. Water 1.0 permanece necessária
para projetos existentes. O ADR-0092 registra falhas de uma tentativa anterior
de espuma por profundidade.

## Decisão

Adicionar um modo `cartoon` optativo à API Water e ao nó de cena. O material TSL
gera WGSL para o WebGPU existente, inclusive no host C++/wgpu-native. Ondas de
superfície são analíticas; perturbações locais usam um pool fixo de oito eventos,
com raio e vida limitados. Não há simulação volumétrica nem transferência de
vértices por quadro. O modo simples mantém os defaults anteriores.

Nesta versão a espuma é de superfície e das perturbações. A leitura de profundidade,
refração, reflexo planar e espuma automática de contato do ADR-0092 continuam
adiados. A iluminação usa normais animadas e um reflexo estilizado do céu. Isso
permite validar o material no export sem acrescentar um segundo passe de cena.

## Consequências

O custo principal é por pixel visível, com uma malha e um material. O código nativo
existente executa o shader; alterações adicionais em C++ dependem de evidência de
gargalo ou incompatibilidade. O estilo é uma aproximação artística, não uma
reprodução do shader do jogo de referência. Ondulações não alteram a física.

## Ajuste nativo identificado na validação

A pista completa revelou um defeito no contrato `GPUTexture.format`: o host
criava `RGBA16Float`, mas `formatToString` devolvia `bgra8unorm`. Ao gerar mipmaps,
o Three criava um render bundle incompatível com o alvo real e o wgpu abortava.
Completar a conversão inversa para os formatos já aceitos pelo host e cobrir a
ida e volta em testes C++ é necessário para validar a integração com o cenário.
