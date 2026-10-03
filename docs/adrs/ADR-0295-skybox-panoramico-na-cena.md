# ADR-0295 - Skybox panorâmico declarado na cena

**Data:** 2026-10-03
**Status:** aceito

## Contexto

A engine tinha dois céus data-driven: o degradê procedural (`skyTop`/`skyMiddle`/
`skyBottom`) e o HDRI (`hdri`, só `.hdr`, que vira fundo E luz por imagem). Um
céu desenhado (PNG/JPG equiretangular, com nuvens) só existia em código de jogo:
o teste4 carrega o PNG à mão no `main.ts` e o crash-bandicoot-racer copiou o
padrão no `loadLevel`. Projeto novo nascia com um céu de cor única.

## Decisão

1. **Campo da cena**, não código: `outdoorLighting.skybox` (URL de PNG/JPG/KTX2
   equiretangular 2:1) e `outdoorLighting.skyboxLighting` (default `false`).
   Alternativa descartada: um "skybox padrão" embutido na engine quando a cena
   não define céu — mudaria o visual de todos os jogos existentes sem aviso e
   esconderia o arquivo do autor.
2. **Só fundo por padrão.** A luz continua vindo do degradê/cor da cena; o
   panorama não gera PMREM nem muda a iluminação já ajustada. Com
   `skyboxLighting: true` ele também vira `environment` (como o teste4 faz),
   para quem quer que as cores do céu tinjam os materiais. Alternativa
   descartada: sempre iluminar — custa um PMREM (~144 MB transitório,
   SPEC-0155) e altera o tom de cenas prontas.
3. **Padrão no template**, não na engine: `templates/new-project` traz
   `assets/sky/ceu-tropical.png` já declarado no `level.json`. Cada projeto
   recebe uma cópia que pode trocar ou apagar.

## Consequências

- Jogos removem o código próprio de skybox e declaram o campo.
- O panorama passa pelo `loadTexture` (cache por URL, liberado na troca de
  fase) e funciona no export nativo como qualquer textura.
- Não há edição no Inspector: os campos de céu continuam só no JSON da cena.
