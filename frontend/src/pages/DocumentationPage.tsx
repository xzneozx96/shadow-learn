import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Layout } from '@/components/Layout'
import { Button } from '@/components/ui/button'

interface HeadingItem {
  depth: number
  text: string
  id: string
}

const HEADING_REGEX = /^(#{2,3})\s+(.*)/
const ID_CLEAN_REGEX = /[^\w\u00C0-\u1EF9\s-]/g
const ID_SPACE_REGEX = /\s+/g
const IMG_SRC_REGEX = /^docs\/images/

function generateId(text: string) {
  return text
    .toLowerCase()
    .replace(ID_CLEAN_REGEX, '')
    .replace(ID_SPACE_REGEX, '-')
}

function getTextFromChildren(children: any): string {
  if (typeof children === 'string' || typeof children === 'number')
    return String(children)
  if (Array.isArray(children))
    return children.map(getTextFromChildren).join('')
  if (children && typeof children === 'object' && 'props' in children && children.props.children) {
    return getTextFromChildren(children.props.children)
  }
  return ''
}

export function DocumentationPage() {
  const [lang, setLang] = useState<'vi' | 'en'>('vi')
  const [content, setContent] = useState('')
  const [headings, setHeadings] = useState<HeadingItem[]>([])

  useEffect(() => {
    const fileName = lang === 'vi' ? 'HUONG_DAN_SU_DUNG.txt' : 'USER_MANUAL.txt'
    fetch(`/docs/${fileName}`)
      .then(r => r.text())
      .then((text) => {
        setContent(text)

        const lines = text.split('\n')
        const items: HeadingItem[] = []

        lines.forEach((line) => {
          const match = line.match(HEADING_REGEX)
          if (match) {
            const depth = match[1].length
            const text = match[2]
            const id = generateId(text)
            items.push({ depth, text, id })
          }
        })
        setHeadings(items)
      })
      .catch(console.error)
  }, [lang])

  return (
    <Layout>
      <div className="flex h-[calc(100vh-53px)] overflow-hidden">
        {/* Sidebar TOC - 25% */}
        <aside className="w-96 border-r border-border h-full overflow-y-auto px-6 py-8 shrink-0 bg-background/30 backdrop-blur-md">
          <div className="flex gap-2 mb-6">
            <Button
              variant={lang === 'vi' ? 'default' : 'secondary'}
              onClick={() => setLang('vi')}
            >
              Tiếng Việt
            </Button>
            <Button
              variant={lang === 'en' ? 'default' : 'secondary'}
              onClick={() => setLang('en')}
            >
              English
            </Button>
          </div>

          <nav className="flex flex-col gap-4">
            {headings.map(h => (
              <a
                key={h.id}
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  const el = document.getElementById(h.id)
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                }}
                className={`text-sm transition-colors hover:text-foreground py-1 block ${
                  h.depth === 2
                    ? 'font-medium text-foreground/90'
                    : 'pl-4 text-muted-foreground'
                }`}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </aside>

        {/* Main Content - 75% */}
        <div className="flex-1 h-full overflow-y-auto px-10 py-12">
          <div className="prose prose-invert prose-base max-w-4xl mx-auto">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="scroll-mt-20">{children}</h1>,
                h2: ({ children }) => {
                  const text = getTextFromChildren(children)
                  const id = generateId(text)
                  return <h2 id={id} className="scroll-mt-20">{children}</h2>
                },
                h3: ({ children }) => {
                  const text = getTextFromChildren(children)
                  const id = generateId(text)
                  return <h3 id={id} className="scroll-mt-20">{children}</h3>
                },
                img: ({ node, ...props }) => {
                  const src = props.src?.replace(IMG_SRC_REGEX, '/docs/images')
                  return <img {...props} src={src} className="rounded-lg shadow-md border border-border/50" />
                },
                a: ({ node, children, ...props }) => {
                  if (props.href?.startsWith('#')) {
                    const id = props.href.slice(1)
                    const decodedId = decodeURIComponent(id)
                    const textContent = getTextFromChildren(children)
                    return (
                      <a
                        {...props}
                        onClick={(e) => {
                          const el = document.getElementById(decodedId) || document.getElementById(generateId(textContent))
                          if (el) {
                            e.preventDefault()
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        }}
                      >
                        {children}
                      </a>
                    )
                  }
                  return <a {...props}>{children}</a>
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </Layout>
  )
}
