/** @jsxImportSource hono/jsx */
import { jsx } from 'hono/jsx'
import { SpecDetail } from '../src/components/spec-detail'
import { OpenApiDocument, EndpointOperation } from '../src/types/openapi'

const mockSpec: OpenApiDocument = {
  id: 'test-spec',
  name: 'Test API',
  version: '1.0.0',
  description: 'Test Spec Description',
  servers: [{ url: 'http://localhost:3000' }],
  endpoints: [],
  tags: []
}

const mockEndpoint: EndpointOperation = {
  id: 'post-transfer',
  path: '/api/v1/transfer',
  method: 'POST',
  summary: 'Transfer funds',
  description: `Initiates a **secure transfer**.

### Requirements
- Provide valid \`accountNumber\`
- Pass \`X-Signature\` header

Check [Documentation](https://example.com/docs) for details.`,
  parameters: [
    {
      name: 'X-Trace-ID',
      in: 'header',
      required: true,
      description: 'Unique trace identifier formatted as \`UUIDv4\`',
      schema: { type: 'string' }
    }
  ],
  requestBody: {
    required: true,
    description: 'Request payload containing \`amount\` and \`currency\`'
  },
  responses: [
    {
      statusCode: '200',
      description: 'Transfer completed **successfully**'
    }
  ]
}

async function testSpecDetail() {
  const jsxElement = <SpecDetail spec={mockSpec} endpoint={mockEndpoint} />
  const html = jsxElement.toString()
  console.log('--- SpecDetail Rendered Snippet ---')
  console.log(html.substring(0, 500))

  if (!html.includes('<strong>secure transfer</strong>')) {
    throw new Error('FAILED: bold markdown not in SpecDetail output')
  }
  if (!html.includes('<h3>Requirements</h3>')) {
    throw new Error('FAILED: h3 markdown not in SpecDetail output')
  }
  if (!html.includes('<code>accountNumber</code>')) {
    throw new Error('FAILED: inline code not in SpecDetail output')
  }
  if (!html.includes('<a href="https://example.com/docs" target="_blank"')) {
    throw new Error('FAILED: markdown link not in SpecDetail output')
  }
  if (!html.includes('<code>UUIDv4</code>')) {
    throw new Error('FAILED: parameter inline markdown not in SpecDetail output')
  }
  if (!html.includes('<strong>successfully</strong>')) {
    throw new Error('FAILED: response inline markdown not in SpecDetail output')
  }

  console.log('✓ SpecDetail Markdown Rendering test PASSED 100%!')
}

testSpecDetail()
