export const SITUATIONS = [
  { id: 'casual_chat', title: 'Casual Chat', level: 'Beginner' },
  { id: 'ordering_food', title: 'Ordering Food', level: 'Beginner' },
  { id: 'asking_directions', title: 'Asking Directions', level: 'Intermediate' },
  { id: 'shopping', title: 'Shopping', level: 'Intermediate' },
  { id: 'job_interview', title: 'Job Interview', level: 'Advanced' },
  { id: 'meeting_parents', title: 'Meeting Parents', level: 'Advanced' },
  { id: 'hospital', title: 'Hospital Visit', level: 'Intermediate' },
  { id: 'karaoke', title: 'Karaoke Night', level: 'Beginner' },
  { id: 'market_haggling', title: 'Market Haggling', level: 'Intermediate' },
  { id: 'dating_app', title: 'Dating App', level: 'Advanced' },
] as const

export type Situation = typeof SITUATIONS[number]
