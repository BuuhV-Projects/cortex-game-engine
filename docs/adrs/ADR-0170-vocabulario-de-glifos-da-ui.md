# ADR-0170 - Vocabulário de glifos da UI limitado à fonte embarcada

**Data:** 2026-07-30
**Status:** aceito

## Contexto

O ícone do botão "Guarda-roupa" do teste4 **desapareceu no export para PC**: no
lugar do glifo `✦` (U+2726) o jogo mostra a caixa vazia do `.notdef`. No Studio o
mesmo botão aparece certo.

A causa está na diferença entre os dois backends de texto da UI de runtime:

- **Nativo** (`native/src/shims/text_raster.cpp`, ADR-0103): rasteriza com
  `stb_truetype` sobre **uma única** fonte, a `Roboto-Medium.ttf` copiada pro
  dist. `stbtt_MakeCodepointBitmap` de um codepoint fora da `cmap` desenha o
  glifo 0 (`.notdef`) — a caixa. **Não existe cadeia de fallback.**
- **DOM/Studio** (`src/ui/runtime/uiFont.ts`): registra a mesma Roboto por
  `@font-face` (woff2, subset Latin), mas quando o glifo falta o **Chromium cai
  numa fonte de símbolos do sistema** (Segoe UI Symbol no Windows) e o caractere
  aparece.

Ou seja: o preview do Studio **mascara** a ausência, e o export nativo — o único
lugar sem fallback — é onde o problema aparece. Medindo a `cmap` da fonte
embarcada: **2772 codepoints**. Fora dela, entre outros, `✦` `←` `→` `★` `✓` `⚙`
(curiosidade que mostra o quanto isso é imprevisível a olho: `↑` e `↓` **estão**
na fonte, `←` e `→` **não**).

Dois agravantes:

1. **A falha é silenciosa.** Nada no build, no export ou no boot avisa; o bug só
   aparece rodando o jogo exportado e olhando a tela.
2. **Já tinha acontecido antes.** O `ResultsMenu` do teste4 desenha as 3 estrelas
   como painéis-círculo com o comentário "o rasterizador de fonte do export
   nativo não tem o glifo ★ (vira tofu)" — o contorno foi feito à mão, caso a
   caso, sem nada que impedisse o próximo.

## Decisão

**O vocabulário de glifos da UI de runtime é o subset da fonte embarcada.** Não
haverá cadeia de fallback de fontes no host nativo. Em troca, a engine passa a
**publicar o contrato** e a **falha deixa de ser silenciosa**:

1. A engine gera, a partir da própria `Roboto-Medium.ttf` do export, o arquivo
   **`ui-font-glyphs.json`** (os ranges de codepoints cobertos) e o **vendoriza**
   junto do bundle — os jogos passam a ter o contrato em disco, versionado.
2. Engine e jogo ganham **testes** que varrem os textos de UI e falham quando
   aparece um glifo fora do contrato (detalhes de formato/fluxo na SPEC-0171).
3. Ícone que precise de forma figurativa (roupa, engrenagem, seta) é feito com
   **painéis/formas da própria UI** ou sprite — não com glifo exótico.

### Por que não as alternativas

| Alternativa | Por que não |
| --- | --- |
| **Cadeia multi-fonte no host** (embarcar Noto Sans Symbols 2, ~300KB, e escolher por codepoint a 1ª fonte que tem o glifo) | Resolveria de vez, mas: +300KB por export, código C++ novo no caminho de texto (cache de glifo por fonte, métricas/kerning por fonte) e — o detalhe que pesa — **não restaura o WYSIWYG**: o Studio continuaria caindo na fonte do sistema e o export na Noto, então o mesmo ícone teria dois desenhos. Trocaríamos "não aparece" por "aparece diferente do preview", com mais peso e mais superfície de bug num arquivo que já nos mordeu (ADR-0105). |
| **Fonte de símbolos completa no lugar da Roboto** | A Roboto é a fonte da UI justamente pra casar Studio↔export (ADR-0102/0103); trocar por uma fonte de cobertura ampla degradaria a tipografia de todo texto para resolver 4 ícones. |
| **Desenhar `.notdef` como espaço em branco** | Some com a caixa feia, mas o ícone continua ausente — troca um bug visível por um invisível, que é pior: ninguém percebe no playtest. |
| **Nada, corrigir caso a caso** | É o estado atual, e ele já falhou duas vezes (★ e ✦). Sem lint, o terceiro caso é questão de tempo. |

## Consequências

- **Ícones da UI ficam restritos** ao subset da Roboto embarcada. Verificados e
  disponíveis pra uso decorativo: `› ‹ » « × · • ° ◊ † ‡ § ¶ ※ ⁂ ⁎ ⁑ ↑ ↓ ∆ ∞ ≈ ±`.
  Fora do contrato (viram caixa): `✦ ★ ← → ✓ ✗ ⚙ ● ○ ■ ◆ ♪ ♥`.
- **Setas laterais** não têm glifo: use `‹ ›` (ou `« »`) em texto, ou desenhe.
- Quem precisar de ícone figurativo paga em código de UI (painéis) ou em asset —
  é o preço de manter o export leve e o texto com uma fonte só.
- O contrato é **derivado da fonte**, não uma lista escrita à mão: se um dia a
  fonte embarcada mudar (ou deixar de ser subsetada), o JSON regenera e o lint
  passa a permitir o que a fonte nova cobre — sem tocar em código.
- Se algum dia o custo virar proibitivo (muitos ícones), a porta da cadeia
  multi-fonte continua aberta: este ADR seria substituído, e o lint viraria
  "cobertura da cadeia" em vez de "cobertura da fonte".

Referências: SPEC-0171 (formato do contrato, geração e lint), ADR-0103 (fonte da
UI), ADR-0123 (DOM-lite), SPEC-0165 (tela de Controles).
