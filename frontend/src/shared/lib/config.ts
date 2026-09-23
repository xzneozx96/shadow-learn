export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export interface SharedKeys {
  openrouter: boolean
  azure_speech: boolean
  google: boolean
}

interface AppConfig {
  sttProvider: string
  ttsProvider: string
  sharedKeys: SharedKeys
}

let _promise: Promise<AppConfig> | null = null

export function getAppConfig(): Promise<AppConfig> {
  if (!_promise) {
    _promise = fetch(`${API_BASE}/api/config`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load config')))
      .then((d: { stt_provider: string, tts_provider: string, shared_keys: SharedKeys }) => ({
        sttProvider: d.stt_provider,
        ttsProvider: d.tts_provider,
        sharedKeys: d.shared_keys,
      }))
      .catch(() => ({
        sttProvider: 'deepgram',
        ttsProvider: 'azure',
        sharedKeys: { openrouter: false, azure_speech: false, google: false },
      }))
  }
  return _promise!
}
