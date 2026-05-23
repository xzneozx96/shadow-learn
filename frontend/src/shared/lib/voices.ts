export interface VoiceOption {
  id: string
  label: string
  description: string
  avatarUrl: string
  sampleAudio: string
}

export const DEFAULT_VOICE_ID = 'Chinese (Mandarin)_Gentleman'

export const MINIMAX_VOICES: VoiceOption[] = [
  {
    id: 'Chinese (Mandarin)_Gentleman',
    label: '温润男声',
    description: 'Gentleman · Narration & Storytelling',
    avatarUrl: `/voices/avatars/${encodeURIComponent('Chinese (Mandarin)_Gentleman')}.webp`,
    sampleAudio: `/voices/previews/${encodeURIComponent('Chinese (Mandarin)_Gentleman')}.mp3`,
  },
  {
    id: 'Chinese (Mandarin)_Gentle_Youth',
    label: '温润青年',
    description: 'Gentle Youth · Calm, natural · Narration',
    avatarUrl: `/voices/avatars/${encodeURIComponent('Chinese (Mandarin)_Gentle_Youth')}.webp`,
    sampleAudio: `/voices/previews/${encodeURIComponent('Chinese (Mandarin)_Gentle_Youth')}.mp3`,
  },
  {
    id: 'Chinese (Mandarin)_Radio_Host',
    label: '电台男主播',
    description: 'Radio Host · Podcast style',
    avatarUrl: `/voices/avatars/${encodeURIComponent('Chinese (Mandarin)_Radio_Host')}.webp`,
    sampleAudio: `/voices/previews/${encodeURIComponent('Chinese (Mandarin)_Radio_Host')}.mp3`,
  },
  {
    id: 'Chinese (Mandarin)_Crisp_Girl',
    label: '清脆少女',
    description: 'Crisp Girl · Clear, bright',
    avatarUrl: `/voices/avatars/${encodeURIComponent('Chinese (Mandarin)_Crisp_Girl')}.webp`,
    sampleAudio: `/voices/previews/${encodeURIComponent('Chinese (Mandarin)_Crisp_Girl')}.mp3`,
  },
  {
    id: 'Chinese (Mandarin)_Soft_Girl',
    label: '柔和少女',
    description: 'Soft Girl · Calm, soothing',
    avatarUrl: `/voices/avatars/${encodeURIComponent('Chinese (Mandarin)_Soft_Girl')}.webp`,
    sampleAudio: `/voices/previews/${encodeURIComponent('Chinese (Mandarin)_Soft_Girl')}.mp3`,
  },
  {
    id: 'Chinese (Mandarin)_Warm_Bestie',
    label: '温暖闺蜜',
    description: 'Warm Bestie · Friendly, supportive',
    avatarUrl: `/voices/avatars/${encodeURIComponent('Chinese (Mandarin)_Warm_Bestie')}.webp`,
    sampleAudio: `/voices/previews/${encodeURIComponent('Chinese (Mandarin)_Warm_Bestie')}.mp3`,
  },
  {
    id: 'Chinese (Mandarin)_Sincere_Adult',
    label: '真诚青年',
    description: 'Sincere Adult · Genuine, honest',
    avatarUrl: `/voices/avatars/${encodeURIComponent('Chinese (Mandarin)_Sincere_Adult')}.webp`,
    sampleAudio: `/voices/previews/${encodeURIComponent('Chinese (Mandarin)_Sincere_Adult')}.mp3`,
  },
  {
    id: 'Chinese (Mandarin)_Kind-hearted_Elder',
    label: '花甲奶奶',
    description: 'Kind Elder · Warm, storytelling',
    avatarUrl: `/voices/avatars/${encodeURIComponent('Chinese (Mandarin)_Kind-hearted_Elder')}.webp`,
    sampleAudio: `/voices/previews/${encodeURIComponent('Chinese (Mandarin)_Kind-hearted_Elder')}.mp3`,
  },
]
