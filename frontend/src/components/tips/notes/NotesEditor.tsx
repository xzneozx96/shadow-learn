import type { Editor } from '@tiptap/react'
import Placeholder from '@tiptap/extension-placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Code, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Strikethrough } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useI18n } from '@/contexts/I18nContext'

interface Props {
  html: string
  placeholder?: string
  onChange: (html: string) => void
  /** Debounce window in ms (default 400). Set to 0 to disable in tests. */
  debounceMs?: number
}

export default function NotesEditor({ html, placeholder, onChange, debounceMs = 400 }: Props) {
  const { t } = useI18n()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep flush-on-unmount tolerant of stale closures: latest onChange identity
  // is captured via ref so the cleanup effect (deps: [editor]) always reaches
  // the current handler, not the first-mount one.
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  const placeholderText = placeholder ?? t('tips.notes.editor.placeholder')

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: placeholderText })],
    content: html,
    editorProps: {
      attributes: {
        'class': 'prose prose-invert prose-sm max-w-none focus:outline-none min-h-full flex-1 flex flex-col',
        'data-testid': 'notes-editor-content',
      },
    },
    onUpdate: ({ editor }) => {
      const next = editor.getHTML()
      if (debounceRef.current)
        clearTimeout(debounceRef.current)
      if (debounceMs === 0) {
        onChangeRef.current(next)
        return
      }
      debounceRef.current = setTimeout(() => onChangeRef.current(next), debounceMs)
    },
  })

  // Flush pending debounce on unmount so we never lose the last keystroke.
  // Wrapped in try/catch: if the parent note was deleted while we were
  // editing, onChange may reject (no row to update). Don't crash unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current && editor) {
        clearTimeout(debounceRef.current)
        try {
          onChangeRef.current(editor.getHTML())
        }
        catch {
          // swallow: note removed or videoId switched mid-flush
        }
      }
    }
  }, [editor])

  if (!editor)
    return <div className="p-4 text-xs text-muted-foreground">{t('tips.notes.editor.loading')}</div>

  return (
    <div className="flex-1 flex flex-col rounded-xl border border-border bg-card overflow-hidden focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-primary/5 transition-all min-h-0">
      <Toolbar editor={editor} />
      <div className="flex-1 overflow-y-auto p-3.5 flex flex-col">
        <EditorContent editor={editor} className="flex-1 flex flex-col min-h-0" />
      </div>
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const cls = (active: boolean) =>
    `p-1.5 rounded-lg text-xs hover:bg-secondary/80 transition-colors ${active ? 'bg-secondary text-primary font-semibold' : 'text-muted-foreground'}`
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-muted/40 px-3 py-2" role="toolbar">
      <button type="button" className={cls(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold"><Bold className="size-4" /></button>
      <button type="button" className={cls(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic"><Italic className="size-4" /></button>
      <button type="button" className={cls(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="Strike"><Strikethrough className="size-4" /></button>
      <button type="button" className={cls(editor.isActive('code'))} onClick={() => editor.chain().focus().toggleCode().run()} aria-label="Code"><Code className="size-4" /></button>
      <span className="w-px h-4 bg-border/60 mx-1" />
      <button type="button" className={cls(editor.isActive('heading', { level: 1 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} aria-label="H1"><Heading1 className="size-4" /></button>
      <button type="button" className={cls(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="H2"><Heading2 className="size-4" /></button>
      <button type="button" className={cls(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} aria-label="H3"><Heading3 className="size-4" /></button>
      <span className="w-px h-4 bg-border/60 mx-1" />
      <button type="button" className={cls(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list"><List className="size-4" /></button>
      <button type="button" className={cls(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Ordered list"><ListOrdered className="size-4" /></button>
    </div>
  )
}
