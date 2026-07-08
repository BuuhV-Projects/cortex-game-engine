cmake_minimum_required(VERSION 3.24)
project(cortex-native CXX)

# Host nativo do cortex-game-engine (PRD-0004, M0).
# Deps prebuilt em third_party/ — rode native/scripts/fetch-deps.ps1 antes.

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(TP ${CMAKE_CURRENT_SOURCE_DIR}/third_party)

add_executable(cortex_host
  src/main.cpp
  src/core/app_window.cpp
  src/core/gdk.cpp
  src/core/js_runtime.cpp
  src/napi/napi_util.cpp
  src/shims/animation_frame.cpp
  src/shims/audio.cpp
  src/shims/files.cpp
  src/shims/image_decode.cpp
  src/shims/input.cpp
  src/shims/pak.cpp
  src/shims/rapier.cpp
  src/shims/text_raster.cpp
  src/shims/timers.cpp
  src/shims/user_storage.cpp
  src/shims/ktx2.cpp
  ${TP}/basisu/basisu_transcoder.cpp
  src/webgpu/buffers.cpp
  src/webgpu/commands.cpp
  src/webgpu/device.cpp
  src/webgpu/enums.cpp
  src/webgpu/layouts.cpp
  src/webgpu/navigator.cpp
  src/webgpu/pipeline.cpp
  src/webgpu/supersample.cpp
  src/webgpu/surface.cpp
  src/webgpu/textures.cpp
)

# js/src (prelude + main + three/webgpu) → esbuild → bundle único → hermesc
# → boot.hbc (console não faz parse de JS em runtime; PC segue igual por
# paridade). O esbuild resolve o three no node_modules da raiz do repo.
set(HERMESC ${TP}/hermes/tools/native/release/x86/hermes.exe)
file(GLOB_RECURSE BOOT_JS_SOURCES ${CMAKE_CURRENT_SOURCE_DIR}/js/src/*.js)
add_custom_command(
  OUTPUT ${CMAKE_BINARY_DIR}/boot.bundle.js
  COMMAND node ${CMAKE_CURRENT_SOURCE_DIR}/scripts/bundle.mjs
          ${CMAKE_BINARY_DIR}/boot.bundle.js
  DEPENDS ${BOOT_JS_SOURCES} ${CMAKE_CURRENT_SOURCE_DIR}/scripts/bundle.mjs
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/..
  COMMENT "esbuild: js/src -> boot.bundle.js"
)
add_custom_command(
  OUTPUT ${CMAKE_BINARY_DIR}/boot.hbc
  COMMAND ${HERMESC} -emit-binary -w
          -out ${CMAKE_BINARY_DIR}/boot.hbc ${CMAKE_BINARY_DIR}/boot.bundle.js
  DEPENDS ${CMAKE_BINARY_DIR}/boot.bundle.js
  COMMENT "hermesc: boot.bundle.js -> boot.hbc"
)
add_custom_target(boot_hbc ALL DEPENDS ${CMAKE_BINARY_DIR}/boot.hbc)
add_dependencies(cortex_host boot_hbc)

target_include_directories(cortex_host PRIVATE
  ${TP}/SDL3/include
  ${TP}/miniaudio
  ${TP}/stb
  ${TP}/basisu
  ${TP}/wgpu/include
  ${TP}/hermes/build/native/include
  ${TP}/hermes/build/native/include/node-api
)

# basis_universal transcoder (ADR-0108): habilita KTX2, sem a dependência de Zstd
# (nosso encoder não usa supercompressão Zstd — evita puxar a lib). Vale pro
# basisu_transcoder.cpp E pro ktx2.cpp (que inclui o header e precisa ver o
# ktx2_transcoder, gated por BASISD_SUPPORT_KTX2).
target_compile_definitions(cortex_host PRIVATE
  BASISD_SUPPORT_KTX2=1
  BASISD_SUPPORT_KTX2_ZSTD=0
)

# Rapier nativo (crate Rust em rapier-native/ — `cargo build --release` lá
# antes do build; o fetch-deps NÃO cobre isso porque é código nosso)
set(RAPIER_NATIVE ${CMAKE_CURRENT_SOURCE_DIR}/rapier-native/target/release)

target_link_libraries(cortex_host PRIVATE
  ${TP}/SDL3/lib/x64/SDL3.lib
  ${TP}/wgpu/lib/wgpu_native.dll.lib
  ${TP}/hermes/build/native/win32/x64/hermes.lib
  ${RAPIER_NATIVE}/rapier_native.dll.lib
)

# ── Microsoft GDK (app model console/Xbox — M3, PRD-0004) ────────────────────
# OPT-IN: -DCORTEX_GDK=ON liga o app model GDK (XGameRuntime). O GDK é
# PRÉ-REQUISITO (instalado à parte, não vem no fetch-deps — ver architecture.md).
# Público (Gaming.Desktop.x64) roda sem NDA; alvos de console exigem ID@Xbox+GDKX.
option(CORTEX_GDK "Linka o Microsoft GDK (XGameRuntime) — app model console/Xbox" OFF)
if(CORTEX_GDK)
  # Acha o XGameRuntime.h da MAIOR versão instalada do GDK (windows/ = desktop).
  file(GLOB _gdk_hdrs "C:/Program Files (x86)/Microsoft GDK/*/windows/include/XGameRuntime.h")
  if(NOT _gdk_hdrs)
    message(FATAL_ERROR "CORTEX_GDK=ON mas o GDK não foi achado — instale: https://github.com/microsoft/GDK#installation")
  endif()
  list(SORT _gdk_hdrs)
  list(GET _gdk_hdrs -1 _gdk_hdr)
  get_filename_component(GDK_INC "${_gdk_hdr}" DIRECTORY)          # .../windows/include
  get_filename_component(GDK_WIN "${GDK_INC}" DIRECTORY)          # .../windows
  message(STATUS "GDK: ${GDK_WIN}")
  target_include_directories(cortex_host PRIVATE "${GDK_INC}")
  target_link_libraries(cortex_host PRIVATE "${GDK_WIN}/lib/x64/xgameruntime.lib")
  target_compile_definitions(cortex_host PRIVATE CORTEX_GDK=1)
endif()

# DLLs ao lado do executável
add_custom_command(TARGET cortex_host POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    ${TP}/SDL3/lib/x64/SDL3.dll
    ${TP}/wgpu/lib/wgpu_native.dll
    ${TP}/hermes/build/native/win32/x64/hermes.dll
    ${RAPIER_NATIVE}/rapier_native.dll
    ${TP}/fonts/Roboto-Medium.ttf
    $<TARGET_FILE_DIR:cortex_host>
)
