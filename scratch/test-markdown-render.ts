import { renderMarkdown } from '../src/components/markdown-content'

const sampleMarkdown = `
# Endpoint Overview

This endpoint transfers funds **securely** between accounts.

### Features
- Real-time settlement
- Built-in fraud detection
- Full [RFC 9421](https://www.rfc-editor.org/rfc/rfc9421.html) compliance

> **Important**: All requests require a valid \`X-Signature\` header.

\`\`\`json
{
  "account": "123456",
  "amount": 100.00
}
\`\`\`

| Status Code | Description |
| :--- | :--- |
| 200 | Success |
| 400 | Bad Request |

<script>alert('xss')</script>
`

function testMarkdown() {
  const html = renderMarkdown(sampleMarkdown)
  console.log('--- Rendered HTML ---')
  console.log(html)

  // Verify headers
  if (!html.includes('<h1>Endpoint Overview</h1>')) {
    throw new Error('FAILED: h1 not rendered properly')
  }
  if (!html.includes('<h3>Features</h3>')) {
    throw new Error('FAILED: h3 not rendered properly')
  }

  // Verify bold and lists
  if (!html.includes('<strong>securely</strong>')) {
    throw new Error('FAILED: strong not rendered properly')
  }
  if (!html.includes('<li>Real-time settlement</li>')) {
    throw new Error('FAILED: list item not rendered properly')
  }

  // Verify code blocks and inline code
  if (!html.includes('<code>X-Signature</code>')) {
    throw new Error('FAILED: inline code not rendered properly')
  }
  if (!html.includes('<pre><code class="language-json">')) {
    throw new Error('FAILED: code block not rendered properly')
  }

  // Verify link attributes
  if (!html.includes('target="_blank"') || !html.includes('rel="noopener noreferrer"')) {
    throw new Error('FAILED: link does not have target=_blank or rel=noopener')
  }

  // Verify blockquote
  if (!html.includes('<blockquote>')) {
    throw new Error('FAILED: blockquote not rendered properly')
  }

  // Verify table
  if (!html.includes('<table>') || !html.includes('Status Code')) {
    throw new Error('FAILED: table not rendered properly')
  }

  // Verify XSS script is stripped
  if (html.includes('<script>')) {
    throw new Error('FAILED: script tag was not stripped!')
  }

  // Inline markdown test
  const inlineHtml = renderMarkdown('Parameter \`id\` is **required**', true)
  console.log('--- Inline HTML ---')
  console.log(inlineHtml)
  if (!inlineHtml.includes('<code>id</code>') || !inlineHtml.includes('<strong>required</strong>')) {
    throw new Error('FAILED: inline markdown not rendered properly')
  }
  if (inlineHtml.includes('<p>')) {
    throw new Error('FAILED: inline markdown should not contain <p> tags')
  }

  console.log('ALL MARKDOWN RENDER TESTS PASSED!')
}

testMarkdown()
