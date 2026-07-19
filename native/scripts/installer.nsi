; Instalador Windows do export CortexNative (ADR-0101/ADR-0126). Template
; ESTÁTICO — os valores vêm por /D do make-installer.mjs, então não há
; injeção/escape de string no JS:
;   APPNAME  nome de EXIBIÇÃO (rótulos: janela do instalador, atalhos, Meus Programas)
;   APPID    slug ESTÁVEL (pasta de instalação + chave de desinstalação — não muda
;            se o usuário renomear o jogo, então não órfã a instalação anterior)
;   EXENAME  nome do exe no dist (fixo: launcher.exe) — alvo do atalho/DisplayIcon
;
; Instala POR USUÁRIO (sem admin): %LOCALAPPDATA%\Programs\<id>. Cria atalhos no
; Menu Iniciar e Desktop, registra em "Adicionar/Remover Programas" (HKCU) e gera
; o desinstalador.
Unicode true

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APPID}"
RequestExecutionLevel user

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  ; Empacota todo o dist-native, menos a pasta temporária do cook.
  File /r /x ".cooked-assets" "${DISTDIR}\*"

  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXENAME}"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Adicionar/Remover Programas (por usuário) — chave pelo id estável, rótulo pelo nome
  !define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${EXENAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}"
SectionEnd
