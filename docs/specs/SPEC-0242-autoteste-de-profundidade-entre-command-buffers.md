# SPEC-0242 - Autoteste de profundidade entre command buffers

**Data:** 2026-09-21
**Status:** aceito

## Contexto

O ADR-0237 assume que dá para fazer **duas passes sequenciais, em command
buffers SEPARADOS, compartilhando a mesma textura de profundidade**, a segunda
com `depthLoadOp = Load`, e que a segunda pass enxerga o que a primeira escreveu
na profundidade.

Medições feitas dentro do jogo sugeriam o contrário: o passe nativo lia a
profundidade escrita pelo `three` como se fosse um buffer de zeros, mesmo usando
a view exata da pass que a escreveu. Só que nessas medições o jogo inteiro está
no meio (SSAA, multisample, a RenderTarget do `three`, ordem de submissão do
frame), então elas não distinguem "a premissa não vale neste caminho
wgpu/D3D12" de "tem alguma coisa do jogo no meio".

Faltava um caso **isolado e de resposta conhecida**.

## Decisão

`native/src/webgpu/depth_selftest.{h,cpp}` — autoteste de diagnóstico ligado por
`CORTEX_DEPTH_SELFTEST=1`, que roda **uma vez**, no primeiro frame em que já
existe device, e imprime o resultado em stderr. Sem a variável é no-op. O ponto
de chamada é o início do `runFrame` (`native/src/main.cpp`).

Nada do `three` participa: texturas próprias de 256x256 (cor `RGBA8Unorm` com
`RenderAttachment | CopySrc`, profundidade `Depth24Plus` com `RenderAttachment`),
triângulos de tela cheia, profundidade escolhida pelo viewport
(`minDepth == maxDepth`, mesmo truque do `dual_pass_spike.cpp`, que evita
uniforme e bind group só para escolher a distância).

Três cenários, cada um com texturas próprias para não herdar estado:

| cenário    | passes                                   | esperado   |
| ---------- | ---------------------------------------- | ---------- |
| `base`     | só a pass A                              | `VERMELHO` |
| `oclusao`  | pass A, depois pass B em `z = 0.9`       | `VERMELHO` |
| `controle` | pass A, depois pass B em `z = 0.1`       | `VERDE`    |

- **Pass A** — command encoder próprio e `wgpuQueueSubmit` próprio; cor `Clear`
  preto, profundidade `Clear` em `1.0`, `storeOp = Store`; triângulo de tela
  cheia em `z = 0.5`, `depthWriteEnabled = true`, `depthCompare = Always`,
  vermelho.
- **Pass B** — command encoder **novo** e submit **novo**; cor `Load`,
  profundidade **`Load`**, `storeOp = Store`; mesmo triângulo,
  `depthCompare = LessEqual`, `depthWriteEnabled = false`, verde.

Leitura: pixel central copiado para um buffer com `bytesPerRow` alinhado a 256 e
mapeado (mesmo padrão de readback do `dual_pass_spike.cpp`).

**Interpretação do cenário `oclusao`:** `VERMELHO` = a pass B foi rejeitada pelo
teste de profundidade (`0.9 > 0.5`) ⇒ a profundidade persistiu entre command
buffers ⇒ a premissa do ADR-0237 vale. `VERDE` = a pass B passou ⇒ não enxergou
o que a pass A escreveu ⇒ a premissa não vale neste caminho.

**Validação do instrumento (obrigatória, não opcional):** o cenário `base` prova
que o desenho acontece e o `controle` prova que a pass B **consegue** passar
quando deve (`0.1 <= 0.5`). Se qualquer um dos dois não se comportar, o teste
imprime `INSTRUMENTO INVALIDO` e diz explicitamente que o veredito do `oclusao`
não pode ser usado. Sem esses dois casos, um resultado vermelho não significaria
nada (pipeline quebrado, pass B nunca executada e cor errada dariam o mesmo
vermelho).

## Consequências

**Resultado medido** (2026-09-21, wgpu/D3D12, host nativo, janela offscreen):

```
[depth-selftest] textura=256x256 cor=RGBA8Unorm prof=Depth24Plus zA=0.50 zB_atras=0.90 zB_frente=0.10
[depth-selftest] base     pixel=(1.00,0.00,0.00) lido=VERMELHO esperado=VERMELHO veredito=PASSOU
[depth-selftest] oclusao  pixel=(1.00,0.00,0.00) lido=VERMELHO esperado=VERMELHO veredito=PASSOU
[depth-selftest] controle pixel=(0.00,1.00,0.00) lido=VERDE    esperado=VERDE    veredito=PASSOU
[depth-selftest] instrumento validado (base VERMELHO, controle VERDE)
[depth-selftest] CONCLUSAO: a premissa do ADR-0237 VALE
```

- **A premissa do ADR-0237 se sustenta** no caminho wgpu/D3D12: duas passes em
  command buffers separados compartilhando a textura de profundidade, a segunda
  com `depthLoadOp = Load`, enxergam a profundidade escrita pela primeira. O
  desenho do marco **não** precisa mudar por causa disso.
- O instrumento foi validado na mesma execução — o controle em `z = 0.1`
  atravessou o `LessEqual` e pintou verde, então o vermelho do cenário de
  oclusão é oclusão de verdade, não um teste inerte.
- **Consequência para o diagnóstico do jogo:** como a premissa vale no caso
  isolado, a profundidade lida como zeros no jogo **não** é uma limitação do
  caminho wgpu/D3D12 — a causa está em algo específico do frame real
  (candidatos: multisample/SSAA, a view usada pela RenderTarget do `three`,
  `storeOp` da pass do `three`, ou a ordem de submissão). A investigação deve
  seguir por aí, e não por um redesenho do marco.
- O arquivo é diagnóstico: custo zero sem a variável de ambiente, e pode sair
  quando o assunto fechar.

## Como rodar

```
powershell -File scripts/build-host.ps1 -Worktree <worktree>   # clang-cl oficial
# copie native/build/cortex_host.exe para a pasta do jogo exportado e rode com
CORTEX_WINDOWED=1 CORTEX_WINDOW_OFFSCREEN=1 CORTEX_DEPTH_SELFTEST=1
```
