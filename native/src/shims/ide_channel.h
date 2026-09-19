// Canal de mensagens com a IDE (SPEC-0200 / M1 do PRD-0007).
//
// Linhas JSON pelo par stdin/stdout: a IDE escreve no stdin do host, o host
// responde pelo stdout. O contrato é o MESMO da ponte do editor no browser
// (hello/ack/state/select/field/...), que já é JSON serializável — só o
// transporte muda (postMessage → stdio).
//
// Toda linha do canal vai prefixada por `kIdeChannelPrefix` para conviver com
// os logs que já saem no stdout (o `print` do JS, o boot, o wgpu).
//
// Ligado por `CORTEX_IDE_CHANNEL=1`: sem isso a thread de leitura nem sobe, e
// um jogo standalone (stdin fechado) não paga nada.
#pragma once

#include <node_api.h>

namespace shims {

// Prefixo de toda linha do canal, nos dois sentidos.
inline constexpr const char* kIdeChannelPrefix = "@cortex-ide@";

// Sobe a thread de leitura do stdin e registra no global:
// - __cortexIdeSend(linha)     → escreve uma linha no stdout (prefixada)
// - __cortexIdeOnMessage(fn)   → registra o callback que recebe cada linha
// - __cortexIdeChannel === true → o JS detecta que o canal existe
// No-op quando `CORTEX_IDE_CHANNEL` não está setado.
void registerIdeChannel(napi_env env);

// Entrega ao JS as linhas recebidas desde o frame anterior. Chamado no
// runFrame — a thread de leitura NUNCA toca em NAPI (regra de ouro do host).
void drainIdeMessages(napi_env env);

// Encerra a thread de leitura (shutdown).
void stopIdeChannel();

}  // namespace shims
