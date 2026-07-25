#include "game_config.h"

#include <cstdio>
#include <string>

namespace core {

namespace {

// Lê um arquivo texto inteiro pra string. "" se não abrir (ausente conta como
// vazio — o chamador cai no fallback).
std::string readTextFile(const std::string& path) {
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return "";
  std::fseek(file, 0, SEEK_END);
  long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);
  std::string out;
  if (size > 0) {
    out.resize(static_cast<size_t>(size));
    size_t read = std::fread(&out[0], 1, static_cast<size_t>(size), file);
    out.resize(read);
  }
  std::fclose(file);
  return out;
}

// Extrai o valor string de um campo TOP-LEVEL do JSON plano do cortex.json
// (`"key" : "value"`). Não é um parser geral — cobre o formato que o Studio
// grava (JSON.stringify indentado, valores string). Trata escapes `\"`, `\\`,
// `\/`, `\n`, `\t`. Retorna "" se a chave não existe ou o valor não é string.
std::string extractJsonString(const std::string& json, const std::string& key) {
  const std::string needle = "\"" + key + "\"";
  size_t k = json.find(needle);
  if (k == std::string::npos) return "";
  size_t i = k + needle.size();
  // pula espaço, dois-pontos, espaço até a aspa de abertura do valor
  while (i < json.size() && (json[i] == ' ' || json[i] == '\t' || json[i] == '\n' ||
                             json[i] == '\r' || json[i] == ':')) {
    i++;
  }
  if (i >= json.size() || json[i] != '"') return "";  // valor não-string
  i++;  // entra no conteúdo
  std::string value;
  while (i < json.size()) {
    char c = json[i];
    if (c == '\\' && i + 1 < json.size()) {
      char n = json[i + 1];
      switch (n) {
        case 'n': value += '\n'; break;
        case 't': value += '\t'; break;
        case 'r': value += '\r'; break;
        default: value += n; break;  // \" \\ \/ e afins → caractere literal
      }
      i += 2;
      continue;
    }
    if (c == '"') break;  // fim da string
    value += c;
    i++;
  }
  return value;
}

// Extrai um bool TOP-LEVEL (`"key": true`) do mesmo JSON plano. Ausente ou
// qualquer coisa que não seja o literal `true` conta como false.
bool extractJsonBool(const std::string& json, const std::string& key) {
  const std::string needle = "\"" + key + "\"";
  size_t k = json.find(needle);
  if (k == std::string::npos) return false;
  size_t i = k + needle.size();
  while (i < json.size() && (json[i] == ' ' || json[i] == '\t' || json[i] == '\n' ||
                             json[i] == '\r' || json[i] == ':')) {
    i++;
  }
  return json.compare(i, 4, "true") == 0;
}

}  // namespace

GameConfig loadGameConfig(const std::string& baseDir, const std::string& fallbackSlug) {
  const std::string json = readTextFile(baseDir + "cortex.json");
  std::string id = extractJsonString(json, "id");
  std::string name = extractJsonString(json, "name");
  if (id.empty()) id = fallbackSlug;
  if (name.empty()) name = id;
  return GameConfig{id, name, extractJsonBool(json, "debug")};
}

}  // namespace core
