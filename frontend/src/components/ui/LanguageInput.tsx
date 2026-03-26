import type { ComponentProps } from 'react'
import type { InputMode } from '@/lib/language-caps'
// import { ChineseInput } from './ChineseInput'
import { Input } from './input'

interface LanguageInputProps extends Omit<ComponentProps<typeof Input>, 'inputMode'> {
  langInputMode: InputMode
  wrapperClassName?: string // dormant — only used by ChineseInput branch
}

export function LanguageInput({
  langInputMode: _langInputMode,
  wrapperClassName: _wrapperClassName,
  value,
  onChange,
  ...props
}: LanguageInputProps) {
  // Custom IME disabled — rely on system IME instead.
  // To re-enable, uncomment the ChineseInput import above and restore:
  //   if (langInputMode === 'ime-chinese') {
  //     return (
  //       <ChineseInput
  //         value={(value as string) ?? ''}
  //         onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
  //         wrapperClassName={wrapperClassName}
  //         {...props}
  //       />
  //     )
  //   }
  return <Input value={value} onChange={onChange} {...props} />
}
