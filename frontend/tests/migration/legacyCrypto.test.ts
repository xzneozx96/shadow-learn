import type { EncryptedData } from '@/features/migration/legacyCrypto'
import { describe, expect, it } from 'vitest'
import { decryptKeys } from '@/features/migration/legacyCrypto'

// Produced by the deleted encryptKeys({ openrouterApiKey, azureSpeechKey, azureSpeechRegion }, '4821').
const FIXTURE = {
  encrypted: 'LfXtIYv1/r+Bo7AqMOsO0qmOd3H1GiVnKwEqZbEjq1yCXeELM4m3/rJYNIGoayRlHdGRtUWtwiK5oMmI+buBVMWjBS63aWJKZL2hk5CguFfXtec5HmoSCwmJ7Ji1CMKrJHldVsZuk9ud1lIShLizX3psRNT8pLUpqHa6',
  salt: 'DSZ5TgU/SJq6ueJ+T7Pitw==',
  iv: '+l50SdVL4YhR6FmX',
}

function bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

function fixture(): EncryptedData {
  const encrypted = bytes(FIXTURE.encrypted)
  return { encrypted: encrypted.buffer.slice(0) as ArrayBuffer, salt: bytes(FIXTURE.salt), iv: bytes(FIXTURE.iv) }
}

describe('decryptKeys', () => {
  it('decrypts keys that the old PIN setup encrypted', async () => {
    await expect(decryptKeys(fixture(), '4821')).resolves.toEqual({
      openrouterApiKey: 'sk-or-fixture-0001',
      azureSpeechKey: 'az-fixture-0002',
      azureSpeechRegion: 'eastasia',
    })
  })

  it('rejects a wrong PIN', async () => {
    await expect(decryptKeys(fixture(), '0000')).rejects.toThrow()
  })
})
