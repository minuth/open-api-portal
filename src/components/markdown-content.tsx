import { jsx } from 'hono/jsx'
import { raw } from 'hono/html'
import { marked } from 'marked'

// Configure marked with GFM and line breaks
marked.setOptions({
  gfm: true,
  breaks: true
})

// Custom renderer for safe external links
marked.use({
  renderer: {
    link({ href, title, text }) {
      const cleanHref = (href || '').replace(/"/g, '&quot;')
      const titleAttr = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
      const isExternal = cleanHref.startsWith('http://') || cleanHref.startsWith('https://')
      const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''
      return `<a href="${cleanHref}"${targetAttr}${titleAttr} class="markdown-link">${text}</a>`
    }
  }
})

function sanitizeHtml(htmlStr: string): string {
  return htmlStr
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
}

export function renderMarkdown(content?: string | null, inline = false): string {
  if (!content || !content.trim()) return ''
  try {
    const rawHtml = inline
      ? (marked.parseInline(content) as string)
      : (marked.parse(content, { async: false }) as string)
    return sanitizeHtml(rawHtml)
  } catch {
    return content || ''
  }
}

export interface MarkdownContentProps {
  content?: string | null
  className?: string
  inline?: boolean
}

export const MarkdownContent = ({
  content,
  className = 'markdown-content',
  inline = false
}: MarkdownContentProps) => {
  if (!content || !content.trim()) return null
  const html = renderMarkdown(content, inline)
  if (inline) {
    return <span class={className}>{raw(html)}</span>
  }
  return <div class={className}>{raw(html)}</div>
}
