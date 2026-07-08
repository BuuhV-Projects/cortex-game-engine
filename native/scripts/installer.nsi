; Instalador Windows do export CortexNative (ADR-0101). Template ESTÁTICO — os
; valores vêm por /D do make-installer.mjs (APPNAME, DISTDIR, OUTFILE), então não
; há injeção/escape de string no JS.
;
; Instala POR USUÁRIO (sem admin): %LOCALAPPDATA%\Programs\<app>. Cria atalhos no
; Menu Iniciar e Desktop, registra em "Adicionar/Remover Programas" (HKCU) e gera
; o desinstalador.
Unicode true

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
RequestExecutionLevel user

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  ; Empacota todo o dist-native, menos a pasta temporária do cook.
  File /r /x ".cooked-assets" "${DISTDIR}\*"

  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${APPNAME}.exe"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Adicionar/Remover Programas (por usuário)
  !define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\${APPNAME}.exe"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
SectionEnd
