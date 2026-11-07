# SPEC-0710 - Vistas do teclado numérico na prévia do Auto-rig

**Data:** 2026-11-07
**Status:** implementado

## Contexto

No modal "Auto-rig de personagem" (aba Animações e marcadores) o usuário confere a pose e a pegada da arma girando a
câmera à mão. Faltavam as vistas rápidas do Blender pelo teclado numérico para olhar a mão de frente, de lado e de cima.
Só UX da câmera da prévia: não mexe em pose, pegada nem gravação.

## Comportamento

Teclas pelo `KeyboardEvent.code` (`Numpad1`…), então funcionam com o NumLock ligado ou desligado. O inverso aceita
**Ctrl** (Blender) ou **Shift**. No Windows, Shift+Numpad com o NumLock ligado chega sem `shiftKey` e com a tecla de
navegação (`End`, `PageDown`…) no lugar do dígito: NumLock ligado + tecla que não é dígito conta como Shift.

| Tecla | Vista |
| --- | --- |
| Numpad 1 / Ctrl·Shift+1 | frente (câmera em +Z) / trás (−Z) |
| Numpad 3 / Ctrl·Shift+3 | direita (+X) / esquerda (−X) |
| Numpad 7 / Ctrl·Shift+7 | topo (+Y) / baixo (−Y) |
| Numpad 9 | vista oposta à atual (inverte a direção câmera→alvo) |
| Numpad 5 | alterna perspectiva / ortográfica |

- Eixos **globais** do mundo (não o local do personagem). A câmera mira o alvo atual do orbit (o centro do personagem,
  ou para onde o usuário fez pan) e mantém a distância.
- Como o "Auto Perspective" do Blender: 1/3/7 entram na vista alinhada já **ortográfica**. Girar a câmera (orbit) solta:
  volta à perspectiva livre. Pan e zoom não soltam (a direção não muda).
- Numpad 5 em perspectiva **endireita**: vai para a vista alinhada mais próxima da direção atual, em ortográfica. Em
  ortográfica, volta à perspectiva sem mexer na direção. Assim "mexeu livre, soltou; 5 de novo, endireita".
- No topo/baixo a câmera fica a um fio do polo (o OrbitControls não aceita o polo exato) com a tela "pra cima" em −Z.
- Não dispara com foco em `input`/`select`/`textarea`/editável (mesma guarda dos atalhos W/E/Esc).

## Implementação

- `electron/renderer/rigViewKeys.ts`: parte pura — tecla → vista, vista oposta, vista mais próxima de uma direção.
- `electron/renderer/RigViewCamera.ts`: aplica na `PerspectiveCamera` + `OrbitControls` da prévia e solta ao orbitar.
- Ortográfica emulada: a mesma `PerspectiveCamera` com FOV de 1° afastada na proporção para o enquadramento no alvo não
  mudar. Evita trocar a câmera que o gizmo (`TransformControls`), o pick de juntas e a arma já seguram. Paralaxe
  residual ~1%, invisível para conferir alinhamento.

## Consequências

- Trocar por `OrthographicCamera` de verdade exigiria repassar a câmera nova a todos os donos (gizmo, pick, arma) —
  só se a paralaxe residual atrapalhar.
- Testes: `tests/electron/rigViewKeys.test.ts`.
