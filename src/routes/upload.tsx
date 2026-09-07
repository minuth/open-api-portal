import { Hono } from 'hono'
import { jsx } from 'hono/jsx'
import { localStorageProvider, memoryStorageProvider } from '../services/storage-instances'
import { AlertBox } from '../components/alert-box'
import { InvalidSpecError, StorageError } from '../types/errors'
import { logServerError } from '../utils/logger'

export const uploadApp = new Hono()

uploadApp.post('/api/upload', async (c) => {
  try {
    const user = c.get('user')
    const body = await c.req.parseBody()
    const specFile = body['specFile']
    let mode = (body['mode'] as string) || 'save'

    // Viewer role is strictly restricted to Sandbox (view-only) mode
    if (user?.role === 'viewer') {
      if (mode === 'save') {
        return c.html(
          <AlertBox
            title="Access Denied"
            message="As a Viewer, you can only upload private Sandbox specifications."
          />,
          403
        )
      }
      mode = 'view'
    }

    // Saving to project requires admin or editor role
    if (mode === 'save' && user && user.role !== 'admin' && user.role !== 'editor') {
      return c.html(
        <AlertBox
          title="Access Denied"
          message="Only Admins and Editors can save specifications to the project."
        />,
        403
      )
    }

    if (!specFile) {
      return c.html(
        <AlertBox title="Upload Failed" message="No OpenAPI specification file was selected." />,
        400
      )
    }

    let filename = 'uploaded-spec.yaml'
    let yamlContent = ''

    if (specFile instanceof File) {
      filename = specFile.name || filename
      yamlContent = await specFile.text()
    } else if (typeof specFile === 'string') {
      yamlContent = specFile
    } else {
      return c.html(
        <AlertBox title="Upload Failed" message="Invalid file format uploaded." />,
        400
      )
    }

    if (!yamlContent || !yamlContent.trim()) {
      return c.html(
        <AlertBox title="Upload Failed" message="The uploaded file is empty." />,
        400
      )
    }

    let doc
    if (mode === 'view') {
      // Sandbox mode: pass current userId to isolate sandbox specs to the logged in user
      doc = await memoryStorageProvider.saveSpec(filename, yamlContent, user?.id)
    } else {
      doc = await localStorageProvider.saveSpec(filename, yamlContent)
    }

    c.header('HX-Redirect', `/specs/${encodeURIComponent(doc.id)}`)
    return c.text('Upload Successful')
  } catch (err: unknown) {
    logServerError('POST /api/upload', err)

    const message = err instanceof Error ? err.message : String(err)
    let title = 'Upload Error'
    if (err instanceof InvalidSpecError) {
      title = 'Invalid OpenAPI Specification'
    } else if (err instanceof StorageError) {
      title = 'Storage Error'
    }

    return c.html(<AlertBox title={title} message={message} />, 400)
  }
})

