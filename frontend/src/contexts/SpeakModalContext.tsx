import { createContext, use, useState } from 'react'

interface SpeakModalContextValue {
  isOpen: boolean
  openSpeakModal: () => void
  closeSpeakModal: () => void
}

const SpeakModalContext = createContext<SpeakModalContextValue | null>(null)

export function SpeakModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <SpeakModalContext value={{ isOpen, openSpeakModal: () => setIsOpen(true), closeSpeakModal: () => setIsOpen(false) }}>
      {children}
    </SpeakModalContext>
  )
}

export function useSpeakModal() {
  const ctx = use(SpeakModalContext)
  if (!ctx)
    throw new Error('useSpeakModal must be used within SpeakModalProvider')
  return ctx
}
