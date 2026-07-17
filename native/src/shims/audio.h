// Áudio nativo: decode (miniaudio: wav/mp3/flac) + playback (streams SDL3,
// um por voz, com gain/pitch nativos). O JS enxerga __cortexAudio
// (decode/play/setGain/stop); a forma WebAudio que o THREE.Audio espera é
// reconstruída em js/src/shims/webaudio-lite.js.
#pragma once

#include <node_api.h>

namespace shims {

// Registra __cortexAudio no global (SDL_INIT_AUDIO já feito pelo host).
void registerAudio(napi_env env);

// Por frame: realimenta vozes em loop e recolhe vozes terminadas.
void updateAudio();

// Shutdown: para e destrói todas as vozes.
void shutdownAudio();

}  // namespace shims
