# ADR 0749 - Soltar os pixels no upload e redecodificar sob demanda

**Data:** 2026-11-27
**Status:** aceito

## Contexto

O host guarda em RAM o RGBA de toda imagem PNG/JPG depois de mandá-la para a GPU (SPEC-0748). Soltar esse RGBA
derruba a memória externa do Hermes, mas a mesma imagem pode precisar subir de novo: o three cria uma textura de
GPU por objeto `Texture`, e clones (`texture.clone()`) dividem a mesma imagem e sobem separados, às vezes muito
depois; `needsUpdate` reenvia; o canvas 2D lê `rgba` no `drawImage`. Se os pixels sumirem, o
`copyExternalImageToTexture` nativo lança "source sem rgba".

## Decisão

Soltar os pixels **3 s depois do último upload** da imagem e, se alguém pedir de novo, **decodificar de novo a partir
dos bytes comprimidos** que o bitmap guarda (PNG/JPG, 10 a 20 vezes menores). O prazo cobre os clones que sobem logo
depois da primeira textura (GLTFLoader por material, estradas, sprites). Tudo no shim JS (`image.js` e
`image-pixels.js`), sem mexer no host C++.

Alternativas pesadas:

- **Soltar por grupo, como na SPEC-0286** (os pixels somem quando todas as texturas que apontam para a imagem já
  subiram). Rejeitada: só enxerga as texturas que existem na hora; um clone criado depois pelo jogo, um
  `needsUpdate` ou um `drawImage` quebram com exceção. No KTX2 de GLB isso foi aceito porque ninguém reenvia mip
  comprimido; em PNG/JPG os jogos reenviam.
- **Decodificar só no primeiro uso** (o bitmap guarda os bytes e decodifica quando o upload pede). Rejeitada por
  ora: tiraria também o pico do carregamento e o decode de texturas nunca desenhadas, mas leva o custo do decode
  para o primeiro quadro em que a textura aparece, no meio do jogo (travadas no streaming). Fica como passo
  seguinte, se o pico do carregamento continuar alto depois desta mudança.
- **Soltar na hora, logo depois de cada cópia.** Rejeitada na revisão: cada clone da mesma imagem pagaria um decode
  inteiro no quadro em que sobe (50 trechos de estrada com a mesma textura = 50 decodes no mesmo quadro).
- **Soltar no host C++** (o `copyExternalImageToTexture` zera o buffer). Rejeitada: exige recompilar o host e não
  resolve a referência que o JS mantém (o `ArrayBuffer` continua vivo enquanto o bitmap aponta para ele).

## Consequências

- A RAM guarda só os bytes comprimidos de cada imagem.
- Reenvio de textura solta (mais de 3 s depois do último upload) custa um decode, contado em `img-redecode` na
  linha `[image]` da saída do host.
- Quem atribui `bitmap.rgba` à mão tira o bitmap do esquema (não há bytes que reproduzam os pixels novos).
