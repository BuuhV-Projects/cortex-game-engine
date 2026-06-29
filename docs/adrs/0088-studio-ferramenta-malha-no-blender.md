# 0088 - Studio como ferramenta de montagem; geometria no Blender

**Data:** 2026-06-29
**Status:** aceito (substitui a parte de MALHA do 0087)

## Contexto

Tentamos gerar a malha viária da Ceilândia proceduralmente (ADR-0087: EasyRoad estendido —
perfis + extrusão + `compileCity`). **Renderizou, mas não ficou bom.** A causa raiz é estrutural:
gerar **geometria às cegas** (a IA não vê nem itera o resultado visual — só valida por teste de
dados) é justamente o ponto fraco. Malha que passa nos testes não tem "olho".

## Decisão

**A geometria (ruas, quadras, prédios, a cidade) é feita no Blender** — onde o autor **vê e
esculpe** — e importada como `.glb`. **O Cortex Studio é ferramenta de MONTAGEM/edição, não
construtor procedural:** importar/posicionar assets, física (Inspector), scripts (ScriptBehavior),
terreno (sculpt), underlay (referência), e rodar o jogo. Pipeline: **Blender → `.glb` → Studio**.

O código de via do ADR-0087 (`profiles`/`roadProfileMesh`/`compileCity` + o ramo `profile` do
nó `road`) fica **dormente** — não é o caminho da malha final. O nó `road` com `profile` é
aditivo (só dispara se um nó setar `profile`; nada seta), então **não atrapalha**. Os **dados**
(`RegionSpec`, `navGraph`) podem voltar a servir pra **navegação** (NPC/carro) sobre a malha do
Blender, ou pra blockout rápido — mas não pra geometria de produção.

## Consequências

- **Papel da IA (eu) neste projeto:** systems/engine, editor, **dados/specs**, integração e
  tooling — **não** gerar geometria boa às cegas. Pedidos de "construir a cidade/malha" vão pro
  Blender; eu ajudo no pipeline (importar/processar `.glb`, montar a cena, física/scripts/nav).
- A `docs/ceilandia-spec.md` continua válida como **referência de layout** (coords/landmarks) pra
  construir no Blender e montar no Studio. O wire procedural foi **revertido** no jogo.
- Decisão de produto do ADR-0087 ("NÃO modelar ruas no Blender") **revertida** aqui.
- Em aberto: remover de vez os módulos de road procedural do engine, ou mantê-los dormentes
  (tested, inofensivos) pro caso da camada de **navegação** ser reaproveitada. Default: manter.
