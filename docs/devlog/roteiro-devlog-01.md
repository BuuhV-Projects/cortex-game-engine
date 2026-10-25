# Devlog #1 — roteiro (rascunho)

**Duração-alvo:** ~2min55 · **Formato:** 1920×1080, legendas pt-br · **Voz:** narração do autor


| tempo | narração | imagem |
| --- | --- | --- |
| 0:00–0:10 | "Eu estou construindo uma engine de jogos do zero, em TypeScript. E o objetivo é rodar um jogo de mundo aberto no PC e no Xbox." | Corte rápido: código TS → Studio → o jogo rodando na Ceilândia à noite. Título **Cortex Engine — Devlog #1**. |
| 0:10–0:40 | "Essa é a Cortex. Tem um editor próprio, o Studio, onde eu monto as cenas, edito física e materiais ao vivo, e uma IA que me ajuda a montar cenário. Tudo em TypeScript, a mesma linguagem do começo ao fim." | Gravação de tela do Studio: arrastar objeto, mudar física no Inspector, Chat IA montando algo. |
| 0:40–1:20 | "Por que fazer a minha própria engine? Porque eu queria fazer o meu jogo em TypeScript, a linguagem que eu amo. Eu procurei e não achei nenhuma engine em TypeScript no nível de uma Unity ou de uma Godot, que exportasse nativo pro PC e, principalmente, pro Xbox. Usar uma engine de mercado ia me obrigar a aprender C#, GDScript ou C++, e eu não tenho tempo nem disposição pra isso. Mas TypeScript, Node, web e desenvolvimento de software eu domino. Então a Cortex usa exatamente o que eu já sei, e o que falta eu aprendo no caminho. Ela não nasceu pra ser um produto: ela existe pra eu conseguir fazer o meu jogo." | Você na câmera, ou o Studio em plano aberto. Na frase das engines: logos de Unity/Godot/Unreal riscados por "sem TypeScript / sem Xbox", e "C# · GDScript · C++" se apagando. |
| 1:20–1:50 | "Só que tem um problema. No Xbox não é permitido JIT, o truque que deixa o JavaScript rápido. Então eu construí um host nativo em C++: o jogo roda sem navegador, direto na placa de vídeo." | Animação: **TypeScript → Hermes (sem JIT) → host C++ → GPU (D3D12)**. Ícones PC e Xbox no fim. |
| 1:50–2:15 | "Hoje o jogo já roda nativo, mas o desenho de cada quadro ainda passa pelo JavaScript e custa uns 12 milissegundos. Agora eu estou escrevendo um renderer próprio em C++ para trazer isso abaixo de 5 e chegar nos 60 fps." | Gráfico de barras animado: render 12 ms → meta 5 ms. Clipe do autopiloto andando e dirigindo. |
| 2:15–2:45 | "E o primeiro jogo feito nela é o **DDD 61**: um jogo de investigação policial no Distrito Federal. Você é Lucas Rocha, investigador da Polícia Civil. Um caso simples em Ceilândia, um jovem desaparecido, começa a revelar um esquema de corrupção que atravessa todas as cidades do DF." | Gameplay: Ceilândia, Taguatinga, metrô, perseguição de carro, conversa com testemunha. Texto: *Ceilândia · Taguatinga · Águas Claras · Guará · Brasília*. |
| 2:45–2:55 | "Nos próximos devlogs eu mostro como está sendo construir o renderer e o jogo. Se curtiu, acompanha." | Logo DDD 61 + logo Cortex. "Devlog #2 em breve". |

## O que preciso gravar / gerar

- **Gameplay do export nativo (1080p):** autopiloto `walk` e `drive`, noite na Ceilândia, chuva, metrô. Gravar numa folga do lock de medição, ou depois do R1 (fps melhor).
- **Tela do Studio:** você grava ou eu gravo seguindo uma lista de passos.
- **Animações (Remotion):** diagrama do host, gráfico 12 → 5 ms, cartela de título, mapa das cidades.
- **Narração:** Kokoro voz `pm_santa`, `lang='pt-br'` (escolha do autor, 24/10), offline em `D:/tools/tts`
  (modelo `kokoro-v1.0.int8.onnx` + `voices-v1.0.bin`). Licença Apache-2.0, uso comercial liberado.
  Alternativa testada: Piper `pt_BR-faber-medium` (`--length-scale 1.1 --noise-scale 0.5 --noise-w-scale 0.6`), timbre bom, mas só para uso não comercial.

### Correções de pronúncia (aplicar no texto antes de gerar)

| escrito | entrada do TTS |
| --- | --- |
| porque (explicação) | por que |
| TypeScript | Táipiscript |
| Xbox | Équis box |
| C# | Cê xárpi |
| C++ | Cê mais mais |
| GDScript | Gê Dê script |
| Unity | Iúniti |
| Godot | Gôdô |
| Cortex | Córtecs |

## Fica de fora (sem spoiler)

Projeto Integração 61, A Mesa, os finais. O devlog para no gancho do Ato 1.
