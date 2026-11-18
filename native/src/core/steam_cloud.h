// Arquivos na nuvem da Steam (ISteamRemoteStorage) — SPEC-0743, ADR-0744.
// O arquivo fica no cache da Steam (<Steam>/userdata/<conta>/<appid>/remote/),
// por conta, e a Steam sobe ao fechar o jogo e baixa antes de abrir. Como em
// `steam_user.h`, tudo é no-op seguro sem Steam: `false`, nunca exceção.
#pragma once

#include <string>

namespace core {

// `true` se a Steam inicializou e o Remote Storage está vivo. Não diz se o
// jogador ligou a nuvem: com ela desligada o FileWrite grava só no cache local
// da Steam, que é o que se quer (o arquivo continua fora da pasta do jogo).
bool steamCloudAvailable();

// Lê o arquivo inteiro em `out`. `false` se ausente, sem Steam ou leitura curta.
bool steamCloudRead(const std::string& name, std::string* out);

// Grava (substitui) o arquivo. Síncrono, no cache local da Steam.
bool steamCloudWrite(const std::string& name, const std::string& data);

// Apaga o arquivo local e na nuvem.
bool steamCloudDelete(const std::string& name);

// Nome seguro para o Remote Storage: tira '/', '\\', ':' e colapsa "..". Pode
// voltar vazio (o chamador recusa). Exposto para o teste nativo.
std::string steamCloudSafeName(const std::string& name);

}  // namespace core
