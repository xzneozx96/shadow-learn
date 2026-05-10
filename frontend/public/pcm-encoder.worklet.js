// AudioWorklet: receives Float32 frames at the AudioContext's device sample rate,
// accumulates ~80ms batches, linear-resamples each batch to 16kHz,
// converts to Int16 PCM, and posts a single ArrayBuffer to the main thread.
//
// Spec target: wav/pcm, 16-bit, 16kHz, mono.

const TARGET_SAMPLE_RATE = 16000
const BATCH_DURATION_SECONDS = 0.08 // ~80ms

class PcmEncoder extends AudioWorkletProcessor {
  constructor() {
    super()
    // Buffer of Float32 samples at device rate, awaiting batch flush.
    this._buffer = []
    this._batchSizeAtDeviceRate = Math.round(sampleRate * BATCH_DURATION_SECONDS)
  }

  // Linear-resample a Float32 array from device rate to TARGET_SAMPLE_RATE.
  // Aliasing: no anti-alias filter; speech-band content (≤4kHz) survives, suitable
  // for STT. Upgrade to FIR if STT accuracy drops in QA.
  _resample(input) {
    const ratio = sampleRate / TARGET_SAMPLE_RATE
    const outLen = Math.floor(input.length / ratio)
    const out = new Float32Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const srcIndex = i * ratio
      const i0 = Math.floor(srcIndex)
      const i1 = Math.min(i0 + 1, input.length - 1)
      const t = srcIndex - i0
      out[i] = input[i0] * (1 - t) + input[i1] * t
    }
    return out
  }

  // Convert Float32 [-1, 1] → Int16 [-32768, 32767].
  _floatToInt16(input) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return out
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel || channel.length === 0) {
      return true
    }
    // Copy because the underlying buffer is reused across quanta.
    this._buffer.push(new Float32Array(channel))

    let totalSamples = 0
    for (const chunk of this._buffer) {
      totalSamples += chunk.length
    }

    if (totalSamples >= this._batchSizeAtDeviceRate) {
      const merged = new Float32Array(totalSamples)
      let offset = 0
      for (const chunk of this._buffer) {
        merged.set(chunk, offset)
        offset += chunk.length
      }
      this._buffer = []

      const resampled = this._resample(merged)
      const int16 = this._floatToInt16(resampled)
      // Transfer the underlying ArrayBuffer to avoid a copy.
      this.port.postMessage(int16.buffer, [int16.buffer])
    }
    return true
  }
}

registerProcessor('pcm-encoder', PcmEncoder)
