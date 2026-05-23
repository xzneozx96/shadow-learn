import posthog from 'posthog-js'

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined

if (key) {
  posthog.init(key, {
    api_host: 'https://eu.i.posthog.com',
    capture_exceptions: true, // auto-captures unhandled JS exceptions
    autocapture: false, // manual only — prevents capturing PIN/API key inputs
    session_recording: {
      maskAllInputs: true, // CRITICAL: masks PIN and API key fields in replays
      // maskAllText: false,
    },
    persistence: 'localStorage',
  })
}

export { posthog }
