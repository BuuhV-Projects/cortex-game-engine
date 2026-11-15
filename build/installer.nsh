; SPEC-0738: no fim da instalação o Studio checa os requisitos da IA (Claude Code, Blender, Git) e registra o
; MCP `cortex` no Claude Code; na desinstalação, remove o registro. A lógica mora no `cortex-setup` em TS
; (mcp/setup/), rodado pelo exe do próprio Studio em modo Node (ADR-0736). Aqui só chama e mostra o relatório.

!define CORTEX_SETUP '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "$INSTDIR\resources\mcp\cortex-setup.mjs"'
!define CORTEX_REPORT "$INSTDIR\requisitos.txt"
; NSIS_MAX_STRLEN do makensis padrão é 1024: corta o relatório antes, para o rodapé caber na MessageBox
!define CORTEX_REPORT_MAX_CHARS 700
!define CORTEX_EXIT_OK 0

; Liga/desliga ELECTRON_RUN_AS_NODE só no processo do instalador (os filhos herdam).
!macro cortexRunAsNode ON
  !if "${ON}" == "1"
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1")i'
  !else
    ; desligar é obrigatório: o "executar o Studio" do fim herdaria o modo Node e a janela não abriria
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0)i'
  !endif
!macroend

!macro customInstall
  Push $0
  Push $1
  Push $2
  Push $3

  DetailPrint "Verificando os requisitos da IA e registrando o MCP cortex..."
  !insertmacro cortexRunAsNode 1
  nsExec::Exec '${CORTEX_SETUP} --check --register --report "${CORTEX_REPORT}"'
  Pop $0 ; código de saída (0 ok, 1 faltou requisito/registro, 2 erro do setup) ou "error"
  !insertmacro cortexRunAsNode 0
  DetailPrint "cortex-setup terminou com $0"

  ; instalação silenciosa (/S): sem caixa; o relatório fica em requisitos.txt
  ${IfNot} ${Silent}
    StrCpy $1 ""
    ClearErrors
    FileOpen $2 "${CORTEX_REPORT}" r
    ${IfNot} ${Errors}
      ${Do}
        ; o cortex-setup grava em UTF-16LE com BOM (acentos e ✓/✗ sem depender da página de código)
        FileReadUTF16LE $2 $3
        ${If} ${Errors}
          ${ExitDo}
        ${EndIf}
        StrCpy $1 "$1$3"
      ${Loop}
      FileClose $2
    ${EndIf}

    ${If} $1 == ""
      StrCpy $1 "Não foi possível verificar os requisitos (código $0).$\r$\n"
    ${EndIf}
    StrCpy $1 $1 ${CORTEX_REPORT_MAX_CHARS}
    StrCpy $1 "$1$\r$\nRelatório completo: ${CORTEX_REPORT}"

    ; a instalação não é desfeita: o editor funciona sem os requisitos de IA
    ${If} $0 == ${CORTEX_EXIT_OK}
      MessageBox MB_OK|MB_ICONINFORMATION "$1"
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION "$1"
    ${EndIf}
  ${EndIf}

  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro customUnInstall
  ; atualização: o instalador novo registra de novo com o exe novo; não precisa remover
  ${IfNot} ${isUpdated}
    Push $0
    !insertmacro cortexRunAsNode 1
    ; best-effort e silencioso: sem Claude Code ou sem registro, não há o que remover
    nsExec::Exec '${CORTEX_SETUP} --unregister'
    Pop $0
    !insertmacro cortexRunAsNode 0
    Pop $0
  ${EndIf}
!macroend
