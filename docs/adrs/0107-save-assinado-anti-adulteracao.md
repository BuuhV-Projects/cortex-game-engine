# 0107 - Save assinado + ofuscado (anti-adulteração)

**Data:** 2026-07-08
**Status:** aceito

## Contexto

Com o save persistindo em disco (SPEC-0106), o valor era **JSON puro** em
`%APPDATA%/<jogo>/saves/localStorage.json`:

```json
{ "cute-obstacle-rush:save": "{\"version\":1,\"completed\":[\"fase-1\"]}" }
```

O jogador abre no bloco de notas, adiciona ids em `completed` e desbloqueia todas
as fases. Esforço zero. A pergunta do dono: dá pra salvar num formato menos
adulterável, como outras engines?

**Realidade (vale pra qualquer engine):** save do lado do CLIENTE não é
inviolável. Unity (PlayerPrefs/binário), Unreal (`.sav`), Godot
(`open_encrypted_with_pass`) — todos são quebráveis: a chave está no executável,
quem tem empenho extrai. Só save no **servidor** é de verdade à prova de fraude.
O objetivo realista é **(1) subir a barra** (edição casual falha) e **(2)
detectar** adulteração. Pra um platformer single-player onde o único cheat é
liberar fase, isso basta — AES é overkill.

Restrição técnica: o host nativo (Hermes) **não tem WebCrypto** (`crypto.subtle`),
então qualquer hash/cifra é **JS puro** (roda igual no browser e no console).

## Decisão

Novo helper do engine `src/io/signedSave.ts` — `encodeSignedSave(payload, secret)`
/ `decodeSignedSave(token, secret)`. O save vira um token opaco
`CXS1.<dados>.<assinatura>`:

- **Ofuscação:** o payload é XOR com um keystream determinístico derivado da
  chave (`SHA256(secret‖"cxs-obf"‖bloco)`), depois base64. Não parece JSON e
  decodificar o base64 dá lixo — editar à mão não leva a nada.
- **Integridade:** `HMAC-SHA256(secret, payloadClaro)` assina o conteúdo.
  Qualquer byte mexido (dados OU assinatura) faz `decodeSignedSave` devolver
  `null`. O chamador trata `null` como "sem save" (começa limpo).

SHA-256/HMAC em JS puro em `src/io/hmacSha256.ts` (interno, **não** exportado no
`index-runtime`), testado contra vetores NIST/RFC 4231. Cada jogo passa sua
própria `secret` embutida (crackear um não ajuda no outro). O teste4 (`SaveGame`)
embrulha o JSON por esse helper antes do `localStorage.setItem` e verifica no
`getItem`.

## Consequências

- Edição casual do save falha; adulteração é **detectada e rejeitada**.
- **Limite consciente:** a `secret` está no bundle — não é segurança de verdade,
  só dissuasão. Documentado no topo de `signedSave.ts`. Save realmente
  inviolável exigiria servidor (fora de escopo p/ single-player).
- **Migração:** saves antigos em JSON puro não têm o header `CXS1.` →
  `decodeSignedSave` retorna `null` → o jogador recomeça UMA vez ao atualizar.
  Aceitável (o save é só progressão de fase).
- **Reset forçado:** bump no sufixo da `secret` do jogo invalida todos os saves.
- API pública nova (`index-runtime` + `VENDOR_TYPE_MODULES` + engine-api.md);
  `hmacSha256` fica interno. Testes: `tests/io/hmacSha256.test.ts` (vetores) e
  `tests/io/signedSave.test.ts` (round-trip, adulteração de dados/assinatura,
  chave errada, formato legado, unicode). Estende SPEC-0106 (persistência).
