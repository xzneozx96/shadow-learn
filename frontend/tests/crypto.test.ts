import type { DecryptedKeys } from '../src/types'
import { describe, expect, it } from 'vitest'
import { decryptKeys, encryptKeys } from '../src/crypto'

describe('crypto module', () => {
  const testKeys: DecryptedKeys = {
    elevenlabsApiKey: 'el-test-key-12345',
    openrouterApiKey: 'or-test-key-67890',
  }
  const pin = '1234'

  it('should encrypt and decrypt keys round-trip', async () => {
    const encrypted = await encryptKeys(testKeys, pin)
    expect(encrypted.encrypted).toBeInstanceOf(ArrayBuffer)
    expect(encrypted.salt).toBeInstanceOf(Uint8Array)
    expect(encrypted.iv).toBeInstanceOf(Uint8Array)

    const decrypted = await decryptKeys(encrypted, pin)
    expect(decrypted).toEqual(testKeys)
  })

  it('should fail to decrypt with wrong PIN', async () => {
    const encrypted = await encryptKeys(testKeys, pin)
    await expect(decryptKeys(encrypted, 'wrong')).rejects.toThrow()
  })

  it('should produce different ciphertext for same input (random salt/IV)', async () => {
    const e1 = await encryptKeys(testKeys, pin)
    const e2 = await encryptKeys(testKeys, pin)
    const b1 = new Uint8Array(e1.encrypted)
    const b2 = new Uint8Array(e2.encrypted)
    // Very unlikely to be equal with random salt+IV
    expect(b1).not.toEqual(b2)
  })
})
