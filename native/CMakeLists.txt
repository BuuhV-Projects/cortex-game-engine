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
  src/core/js_runtime.cpp
  src/napi/napi_util.cpp
  src/shims/animation_frame.cpp
  src/shims/files.cpp
  src/shims/image_decode.cpp
  src/shims/input.cpp
  src/shims/rapier.cpp
  src/shims/timers.cpp
  src/webgpu/buffers.cpp
  src/webgpu/commands.cpp
  src/webgpu/device.cpp
  src/webgpu/enums.cpp
  src/webgpu/layouts.cpp
  src/webgpu/navigator.cpp
  src/webgpu/pipeline.cpp
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
  ${TP}/stb
  ${TP}/wgpu/include
  ${TP}/hermes/build/native/include
  ${TP}/hermes/build/native/include/node-api
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

# DLLs ao lado do executável
add_custom_command(TARGET cortex_host POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    ${TP}/SDL3/lib/x64/SDL3.dll
    ${TP}/wgpu/lib/wgpu_native.dll
    ${TP}/hermes/build/native/win32/x64/hermes.dll
    ${RAPIER_NATIVE}/rapier_native.dll
    $<TARGET_FILE_DIR:cortex_host>
)
