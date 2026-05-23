import type { VocabItem } from '@/shared/types'

export interface SituationPreviewData {
  title: string
  ai_role: string
  scene_context: string
  opening_line: string
  opening_line_translation: string
  user_goal: string
  target_vocab: VocabItem[]
}

export interface SessionStartApiResponse {
  livekit_url: string
  livekit_token: string
  session_id: string
  situation: SituationPreviewData
}

export interface GeneratedSituation {
  situation_id: string
  title: string
  ai_role: string
  scene_context: string
  opening_line: string
  opening_line_translation: string
  user_goal: string
  target_vocab: VocabItem[]
}
