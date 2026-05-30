import { AssetLoader } from 'cortex-game-engine'

import offlowUrl      from '../assets/BAC_Mono_offlow.wav?url'
import offmidUrl      from '../assets/BAC_Mono_offmid.wav?url'
import offhighUrl     from '../assets/BAC_Mono_offhigh.wav?url'
import offveryhighUrl from '../assets/BAC_Mono_offveryhigh.wav?url'
import onlowUrl       from '../assets/BAC_Mono_onlow.wav?url'
import onmidUrl       from '../assets/BAC_Mono_onmid.wav?url'
import onhighUrl      from '../assets/BAC_Mono_onhigh.wav?url'

export interface EngineSampleSet {
  offlow: AudioBuffer
  offmid: AudioBuffer
  offhigh: AudioBuffer
  offveryhigh: AudioBuffer
  onlow: AudioBuffer
  onmid: AudioBuffer
  onhigh: AudioBuffer
}

let loaded: EngineSampleSet | null = null
let loading: Promise<EngineSampleSet> | null = null

/**
 * Pré-carrega os samples BAC Mono uma vez. Chamadas subsequentes retornam
 * a mesma referência sem nova requisição.
 */
export function loadEngineSamples(): Promise<EngineSampleSet> {
  if (loaded) return Promise.resolve(loaded)
  if (loading) return loading

  const loader = new AssetLoader()
  loading = (async () => {
    const [offlow, offmid, offhigh, offveryhigh, onlow, onmid, onhigh] = await Promise.all([
      loader.loadAudio(offlowUrl),
      loader.loadAudio(offmidUrl),
      loader.loadAudio(offhighUrl),
      loader.loadAudio(offveryhighUrl),
      loader.loadAudio(onlowUrl),
      loader.loadAudio(onmidUrl),
      loader.loadAudio(onhighUrl),
    ])
    loaded = { offlow, offmid, offhigh, offveryhigh, onlow, onmid, onhigh }
    return loaded
  })()
  return loading
}
