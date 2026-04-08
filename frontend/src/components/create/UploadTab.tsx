import { FileVideo, Upload } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2 GB

interface UploadTabProps {
  file: File | null
  onFileChange: (file: File | null) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function UploadTab({ file, onFileChange }: UploadTabProps) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_SIZE) {
      setError(t('create.fileSizeError'))
      onFileChange(null)
      return
    }
    setError(null)
    onFileChange(f)
  }, [onFileChange, t])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f)
      handleFile(f)
  }, [handleFile])

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-white/15 p-6 transition-colors',
          dragOver && 'border-emerald-500 bg-emerald-500/10',
        )}
        data-testid="create-lesson-upload-dropzone"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          className="hidden"
          data-testid="create-lesson-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f)
              handleFile(f)
          }}
        />

        {file
          ? (
              <div className="flex items-center gap-2 text-white/65">
                <FileVideo className="size-5" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-sm text-muted-foreground">
                  (
                  {formatFileSize(file.size)}
                  )
                </span>
              </div>
            )
          : (
              <>
                <Upload className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t('create.dragDropHint')}
                </p>
              </>
            )}
      </div>

      {error && <p className="text-sm text-destructive" data-testid="create-lesson-upload-error">{error}</p>}
    </div>
  )
}
