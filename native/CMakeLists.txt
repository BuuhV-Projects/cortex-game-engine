cmake_minimum_required(VERSION 3.24)
project(cortex-native CXX)

# Host nativo do cortex-game-engine (PRD-0004, M0).
# Deps prebuilt em third_party/ — rode native/scripts/fetch-deps.ps1 antes.

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(TP ${CMAKE_CURRENT_SOURCE_DIR}/third_party)

add_executable(cortex_host
  src/main.cpp
)

target_include_directories(cortex_host PRIVATE
  ${TP}/SDL3/include
  ${TP}/wgpu/include
  ${TP}/hermes/build/native/include
  ${TP}/hermes/build/native/include/node-api
)

target_link_libraries(cortex_host PRIVATE
  ${TP}/SDL3/lib/x64/SDL3.lib
  ${TP}/wgpu/lib/wgpu_native.dll.lib
  ${TP}/hermes/build/native/win32/x64/hermes.lib
)

# DLLs ao lado do executável
add_custom_command(TARGET cortex_host POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E copy_if_different
    ${TP}/SDL3/lib/x64/SDL3.dll
    ${TP}/wgpu/lib/wgpu_native.dll
    ${TP}/hermes/build/native/win32/x64/hermes.dll
    $<TARGET_FILE_DIR:cortex_host>
)
