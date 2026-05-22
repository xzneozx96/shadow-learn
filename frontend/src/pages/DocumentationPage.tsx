import { ChevronDown, Hammer, Rocket, Search, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Layout } from '@/components/Layout'
import { useI18n } from '@/contexts/I18nContext'

interface HeadingItem {
  depth: number
  text: string
  id: string
}

interface TreeNode extends HeadingItem {
  children: TreeNode[]
}

const HEADING_REGEX = /^(#{2,3})\s+(.*)/
const ID_CLEAN_REGEX = /[^\w\u00C0-\u1EF9\s-]/g
const ID_SPACE_REGEX = /\s+/g
const IMG_SRC_REGEX = /^docs\/images/
const SECTION_NUM_REGEX = /^\D*(\d+)\./

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
  const { locale, t } = useI18n()
  const [content, setContent] = useState('')
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const fileName = locale === 'vi' ? 'HUONG_DAN_SU_DUNG.txt' : 'USER_MANUAL.txt'
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
  }, [locale])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter(e => e.isIntersecting)
        if (visibleEntries.length > 0) {
          visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          setActiveId(visibleEntries[0].target.id)
        }
      },
      { rootMargin: '-10% 0px -80% 0px' },
    )

    const elements = document.querySelectorAll('h2, h3')
    elements.forEach(el => observer.observe(el))

    return () => observer.disconnect()
  }, [headings])

  // Build tree hierarchy
  const tree: TreeNode[] = []
  let currentH2: TreeNode | null = null

  headings.forEach((h) => {
    if (h.depth === 2) {
      currentH2 = { ...h, children: [] }
      tree.push(currentH2)
    }
    else if (h.depth === 3 && currentH2) {
      currentH2.children.push({ ...h, children: [] })
    }
    else if (!currentH2) {
      tree.push({ ...h, children: [] })
    }
  })

  // Group into categories by leading section number (locale-agnostic; the
  // English manual has an unnumbered "Overview" heading that the Vietnamese
  // one lacks, so positional slicing would drift by one).
  const sectionNum = (node: TreeNode) => {
    const m = node.text.match(SECTION_NUM_REGEX)
    return m ? Number(m[1]) : 0
  }
  const categories = [
    {
      title: t('docs.category.getStarted'),
      icon: <Rocket className="w-4 h-4" />,
      items: tree.filter(n => sectionNum(n) <= 2),
    },
    {
      title: t('docs.category.features'),
      icon: <Hammer className="w-4 h-4" />,
      items: tree.filter(n => sectionNum(n) >= 3 && sectionNum(n) <= 10),
    },
    {
      title: t('docs.category.management'),
      icon: <Settings className="w-4 h-4" />,
      items: tree.filter(n => sectionNum(n) >= 11),
    },
  ]

  return (
    <Layout>
      <div className="relative z-5 flex h-full w-full text-foreground font-sans overflow-hidden">
        {/* Left Sidebar - Navigation & TOC */}
        <aside className="w-80 shrink-0 border-r border-border flex flex-col h-full">
          {/* Search */}
          <div className="p-4 pt-6 space-y-4">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
              <input
                type="text"
                placeholder={t('docs.search.placeholder')}
                className="w-full bg-input/50 text-sm rounded-md py-2 pl-9 pr-4 outline-none focus:ring-1 focus:ring-primary/50 transition-all text-foreground placeholder:text-muted-foreground border focus:border-border/50"
              />
            </div>
          </div>

          {/* Hierarchical TOC */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
            {categories.map(cat => (
              <div key={cat.title} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
                  {cat.icon}
                  <span>{cat.title}</span>
                </div>
                <div className="relative border-border space-y-0.5 pl-0">
                  {cat.items.map((node) => {
                    const isActive = activeId === node.id || node.children.some(c => c.id === activeId)
                    const isExpanded = expandedNodes[node.id] || isActive

                    return (
                      <div key={node.id}>
                        {/* Parent section row */}
                        <a
                          href={`#${node.id}`}
                          onClick={(e) => {
                            e.preventDefault()
                            const el = document.getElementById(node.id)
                            if (el)
                              el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            setExpandedNodes(prev => ({ ...prev, [node.id]: !isExpanded }))
                            setActiveId(node.id)
                          }}
                          className={`flex px-2 h-8 items-center justify-between text-sm rounded-md transition-colors hover:bg-white/5 ${
                            isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
                          }`}
                        >
                          <span className="truncate">{node.text}</span>
                          {node.children.length > 0 && (
                            <ChevronDown className={`size-4.5 shrink-0 opacity-40 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`} />
                          )}
                        </a>

                        {/* Child sub-items with left accent line */}
                        {node.children.length > 0 && isExpanded && (
                          <div className="relative ml-4 border-l border-border space-y-0">
                            {node.children.map(child => (
                              <a
                                key={child.id}
                                href={`#${child.id}`}
                                onClick={(e) => {
                                  e.preventDefault()
                                  const el = document.getElementById(child.id)
                                  if (el)
                                    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                  setActiveId(child.id)
                                }}
                                className={`flex h-8 items-center pl-4 pr-2 text-sm transition-colors relative ${
                                  activeId === child.id
                                    ? 'text-primary font-medium'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {activeId === child.id && (
                                  <span className="absolute -left-px top-1 bottom-1 w-[2px] rounded-full bg-primary" />
                                )}
                                {child.text}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

        </aside>

        {/* Main Content */}
        <main className="flex-1 h-full overflow-y-auto relative scroll-smooth">
          <div className="max-w-5xl mx-auto px-12 py-16 pb-32">

            <div className="prose prose-invert prose-base max-w-none
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight
                prose-h2:mt-16 prose-h2:mb-6 prose-h2:border-b prose-h2:border-border/20 prose-h2:pb-2
                prose-h3:mt-8 prose-h3:mb-4
                prose-a:text-primary hover:prose-a:text-primary/80 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-foreground
                prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-medium prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-input prose-pre:border prose-pre:border-border/20 prose-pre:rounded-lg
                prose-li:text-muted-foreground
                prose-blockquote:border-primary/50 prose-blockquote:bg-primary/5 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:font-normal prose-blockquote:text-muted-foreground
              "
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-4xl font-bold m-0 tracking-tight">{children}</h1>
                  ),
                  h2: ({ children }) => {
                    const text = getTextFromChildren(children)
                    const id = generateId(text)
                    return <h2 id={id} className="scroll-mt-24">{children}</h2>
                  },
                  h3: ({ children }) => {
                    const text = getTextFromChildren(children)
                    const id = generateId(text)
                    return <h3 id={id} className="scroll-mt-24">{children}</h3>
                  },
                  img: ({ node, ...props }) => {
                    const src = props.src?.replace(IMG_SRC_REGEX, '/docs/images')
                    return <img {...props} src={src} className="rounded-xl shadow-2xl border border-border/20 my-8 w-full object-cover bg-input" />
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
                    return <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        </main>
      </div>
    </Layout>
  )
}
