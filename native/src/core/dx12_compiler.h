// Compilador de shader do D3D12 (SPEC-0731): DXC quando o dxcompiler.dll ao lado
// do exe carrega, FXC (padrão antigo do wgpu, lento e numa thread) quando não.
// O wgpu não volta sozinho para o FXC se o DXC pedido falhar: a instância fica sem
// backend e o erro só aparece como "sem adapter". Por isso a DLL é carregada aqui,
// antes de escolher, e não só conferida no disco.
#pragma once

#include <string>

namespace core {

enum class Dx12Compiler { Fxc, Dxc };

struct Dx12CompilerChoice {
  Dx12Compiler compiler = Dx12Compiler::Fxc;
  /** Caminho absoluto do dxcompiler.dll (vazio no FXC). */
  std::string dxcPath;
  /** Motivo, para o log do host. */
  const char* reason = "";
};

/** Nome da DLL do DXC, procurada na pasta do exe. */
inline constexpr const char* kDxcDllName = "dxcompiler.dll";
/** Variável de ambiente que força o FXC com o valor "fxc". */
inline constexpr const char* kDx12CompilerEnv = "CORTEX_DX12_COMPILER";

/** A DLL carrega e exporta o DxcCreateInstance. */
bool dxcLoads(const std::string& path);

using DxcProbe = bool (*)(const std::string& path);

/**
 * Escolhe o compilador. `baseDir` é a pasta do exe, com a barra no fim (SDL_GetBasePath);
 * `envValue` é o valor de CORTEX_DX12_COMPILER, ou nullptr. "fxc" (sem diferenciar
 * maiúsculas) força o FXC. Sem pasta ou com a DLL que não carrega, também FXC.
 */
Dx12CompilerChoice chooseDx12Compiler(const char* baseDir, const char* envValue,
                                      DxcProbe probe = dxcLoads);

}  // namespace core
