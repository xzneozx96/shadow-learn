export interface DecryptedKeys {
  openrouterApiKey?: string
  azureSpeechKey?: string
  azureSpeechRegion?: string
  googleRealtimeKey?: string
}

export interface EncryptedData {
  encrypted: ArrayBuffer
  salt: Uint8Array
  iv: Uint8Array
}

const PBKDF2_ITERATIONS = 100_000

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as Uint8Array<ArrayBuffer>, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
}

export async function decryptKeys(data: EncryptedData, pin: string): Promise<DecryptedKeys> {
  const key = await deriveKey(pin, data.salt)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.iv as Uint8Array<ArrayBuffer> },
    key,
    // Wrap in Uint8Array to avoid cross-realm ArrayBuffer identity issues in tests
    new Uint8Array(data.encrypted),
  )
  return JSON.parse(new TextDecoder().decode(decrypted))
}
