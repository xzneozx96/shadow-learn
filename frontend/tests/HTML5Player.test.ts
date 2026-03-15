import { describe, expect, it } from 'vitest'
import { HTML5Player } from '../src/player/HTML5Player'

function makeAudio(): HTMLAudioElement {
  const el = document.createElement('audio')
  // jsdom sets volume to 1 by default
  return el
}

describe('HTML5Player.setVolume', () => {
  it('sets volume on the element', () => {
    const el = makeAudio()
    const player = new HTML5Player(el)
    player.setVolume(0.5)
    expect(el.volume).toBe(0.5)
    player.destroy()
  })

  it('clamps values above 1 to 1', () => {
    const el = makeAudio()
    const player = new HTML5Player(el)
    player.setVolume(1.5)
    expect(el.volume).toBe(1)
    player.destroy()
  })

  it('clamps values below 0 to 0', () => {
    const el = makeAudio()
    const player = new HTML5Player(el)
    player.setVolume(-0.1)
    expect(el.volume).toBe(0)
    player.destroy()
  })
})
