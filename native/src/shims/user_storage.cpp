#include "user_storage.h"

#include <SDL3/SDL.h>

#include <cstdio>
#include <cstdlib>
#include <string>

#include "../napi/napi_util.h"

#ifdef CORTEX_GDK
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <XAsync.h>
#include <XGameSaveFiles.h>
#include <XTaskQueue.h>
#include <XUser.h>
#endif

namespace shims {
namespace {

// Pasta gravável do usuário (com separador no fim). Vazia se o host não
// conseguiu resolvê-la — aí as funções viram no-op (o JS cai pra memória).
std::string g_saveDir;

#ifdef CORTEX_GDK
// Pasta do XGameSave (save de console: por-usuário + sync na nuvem). Envolve o
// fluxo async (XUser → XGameSaveFilesGetFolderWithUi) num wait síncrono. Precisa
// de: usuário assinado E um SCID (config do título, do Partner Center/ID@Xbox).
// Sem título/usuário (dev PC), devolve false → cai pro arquivo. Ativa quando
// houver SCID (env CORTEX_SCID) + usuário assinado. É file I/O comum na pasta que
// ele devolve; o sistema faz o sync.
bool tryXGameSaveFolder(std::string& out) {
  const char* scid = std::getenv("CORTEX_SCID");
  if (!scid || !scid[0]) return false;  // sem SCID (título) → fallback arquivo

  XTaskQueueHandle queue = nullptr;
  if (FAILED(XTaskQueueCreate(XTaskQueueDispatchMode::ThreadPool,
                              XTaskQueueDispatchMode::ThreadPool, &queue))) {
    return false;
  }

  bool ok = false;
  XUserHandle user = nullptr;
  XAsyncBlock addBlock{};
  addBlock.queue = queue;
  if (SUCCEEDED(XUserAddAsync(XUserAddOptions::AddDefaultUserSilently, &addBlock)) &&
      SUCCEEDED(XAsyncGetStatus(&addBlock, /*wait*/ true)) &&
      SUCCEEDED(XUserAddResult(&addBlock, &user))) {
    XAsyncBlock folderBlock{};
    folderBlock.queue = queue;
    if (SUCCEEDED(XGameSaveFilesGetFolderWithUiAsync(user, scid, &folderBlock)) &&
        SUCCEEDED(XAsyncGetStatus(&folderBlock, /*wait*/ true))) {
      char folder[MAX_PATH] = {};
      if (SUCCEEDED(XGameSaveFilesGetFolderWithUiResult(&folderBlock, sizeof(folder), folder)) &&
          folder[0]) {
        out = folder;
        if (out.back() != '\\' && out.back() != '/') out += '\\';
        ok = true;
      }
    }
    XUserCloseHandle(user);
  }
  XTaskQueueCloseHandle(queue);
  return ok;
}
#endif

// A chave vem do JS (nome do arquivo do localStorage, ex.: "localStorage.json").
// Como é gravável, BARRA fuga da pasta: tira separadores, ':' e "..". Nunca
// vazio (fallback "store").
std::string safeName(const std::string& name) {
  std::string out;
  for (char c : name) {
    if (c == '/' || c == '\\' || c == ':') continue;  // sem componente de caminho
    if (c == '.' && !out.empty() && out.back() == '.') continue;  // colapsa ".."
    out += c;
  }
  return out.empty() ? "store" : out;
}

std::string filePath(const std::string& name) { return g_saveDir + safeName(name); }

napi_value jsReadUserFile(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);
  if (argc < 1 || g_saveDir.empty()) return nullValue;

  std::string path = filePath(njs::toString(env, args[0]));
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return nullValue;  // ainda não salvou nada
  std::fseek(file, 0, SEEK_END);
  long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);

  std::string buffer;
  if (size > 0) {
    buffer.resize(static_cast<size_t>(size));
    std::fread(&buffer[0], 1, static_cast<size_t>(size), file);
  }
  std::fclose(file);

  napi_value out = nullptr;
  napi_create_string_utf8(env, buffer.data(), buffer.size(), &out);
  return out;
}

napi_value jsWriteUserFile(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value falseValue = nullptr;
  napi_get_boolean(env, false, &falseValue);
  if (argc < 2 || g_saveDir.empty()) return falseValue;

  std::string path = filePath(njs::toString(env, args[0]));
  std::string data = njs::toString(env, args[1]);
  FILE* file = std::fopen(path.c_str(), "wb");
  if (!file) return falseValue;
  if (!data.empty()) std::fwrite(data.data(), 1, data.size(), file);
  std::fclose(file);

  napi_value trueValue = nullptr;
  napi_get_boolean(env, true, &trueValue);
  return trueValue;
}

}  // namespace

void registerUserStorage(napi_env env, const std::string& gameName) {
  g_saveDir.clear();

#ifdef CORTEX_GDK
  // Console/GDK: preferir o XGameSave (por-usuário + sync na nuvem) quando
  // disponível (usuário assinado + SCID do título). Senão cai pro arquivo.
  std::string xsave;
  if (tryXGameSaveFolder(xsave)) {
    g_saveDir = xsave;
    std::fprintf(stderr, "[storage] XGameSave: %s\n", g_saveDir.c_str());
  } else {
    std::fprintf(stderr, "[storage] XGameSave indisponível (sem SCID/usuário) — arquivo local\n");
  }
#endif

  // Fallback (PC / sem XGameSave): SDL_GetPrefPath cria <appdata>/<jogo>/saves/.
  if (g_saveDir.empty()) {
    char* pref = SDL_GetPrefPath(gameName.empty() ? "CortexNative" : gameName.c_str(), "saves");
    if (pref) {
      g_saveDir = pref;
      SDL_free(pref);
    }
  }

  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexReadUserFile", jsReadUserFile);
  njs::setMethod(env, global, "__cortexWriteUserFile", jsWriteUserFile);
}

}  // namespace shims
