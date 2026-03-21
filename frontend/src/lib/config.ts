export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

interface AppConfig {
  sttProvider: string
  ttsProvider: string
}

let _promise: Promise<AppConfig> | null = null

export function getAppConfig(): Promise<AppConfig> {
  if (!_promise) {
    _promise = fetch(`${API_BASE}/api/config`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load config')))
      .then((d: { stt_provider: string, tts_provider: string }) => ({
        sttProvider: d.stt_provider,
        ttsProvider: d.tts_provider,
      }))
      .catch(() => ({ sttProvider: 'deepgram', ttsProvider: 'azure' }))
  }
  return _promise
}
