import type { ComponentProps } from 'react'
import type { InputMode } from '@/lib/language-caps'
import { ChineseInput } from './ChineseInput'
import { Input } from './input'

interface LanguageInputProps extends Omit<ComponentProps<typeof Input>, 'inputMode'> {
  langInputMode: InputMode
  wrapperClassName?: string
}

export function LanguageInput({
  langInputMode,
  wrapperClassName,
  value,
  onChange,
  ...props
}: LanguageInputProps) {
  if (langInputMode === 'ime-chinese') {
    return (
      <ChineseInput
        value={(value as string) ?? ''}
        onChange={onChange as (e: React.ChangeEvent<HTMLInputElement>) => void}
        wrapperClassName={wrapperClassName}
        {...props}
      />
    )
  }
  return <Input value={value} onChange={onChange} {...props} />
}
