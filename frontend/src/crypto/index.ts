import type { DecryptedKeys } from '../types'

export interface EncryptedData {
  encrypted: ArrayBuffer
  salt: Uint8Array
  iv: Uint8Array
}

const PBKDF2_ITERATIONS = 100_000

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as Uint8Array<ArrayBuffer>,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptKeys(
  keys: DecryptedKeys,
  pin: string,
): Promise<EncryptedData> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(pin, salt)

  const encoder = new TextEncoder()
  const plaintext = encoder.encode(JSON.stringify(keys))

  const encryptedRaw = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  )

  // Copy into a same-realm ArrayBuffer (jsdom WebCrypto returns cross-realm buffers)
  const srcBytes = new Uint8Array(encryptedRaw)
  const encrypted = new ArrayBuffer(srcBytes.length)
  new Uint8Array(encrypted).set(srcBytes)

  return { encrypted, salt, iv }
}

export async function decryptKeys(
  data: EncryptedData,
  pin: string,
): Promise<DecryptedKeys> {
  const key = await deriveKey(pin, data.salt)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: data.iv as Uint8Array<ArrayBuffer> },
    key,
    // Wrap in Uint8Array to avoid cross-realm ArrayBuffer identity issues in tests
    new Uint8Array(data.encrypted),
  )

  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(decrypted))
}
