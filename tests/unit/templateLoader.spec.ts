import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { renderTemplate, renderTemplateSync, seedTemplates } from '../../src/core/templateLoader'

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ao-test-'))
}

describe('templateLoader', () => {
  it('renders %var% and supports literal %%', async () => {
    const tmp = makeTmpDir()
    const tdir = path.join(tmp, '.agent', 'templates')
    fs.mkdirSync(tdir, { recursive: true })
    const p = path.join(tdir, 'hello.md')
    fs.writeFileSync(p, 'Hello %name% %% done', 'utf8')

    const out = await renderTemplate(tmp, 'hello.md', { name: 'Alice' })
    expect(out).toBe('Hello Alice % done')

    const out2 = renderTemplateSync(tmp, 'hello.md', { name: 'Bob' })
    expect(out2).toBe('Hello Bob % done')
  })

  it('seedTemplates writes defaults and does not overwrite', async () => {
    const tmp = makeTmpDir()
    const tdir = path.join(tmp, '.agent', 'templates')

    // seed into empty directory
    await seedTemplates(tmp)
    expect(fs.existsSync(tdir)).toBe(true)
    expect(fs.existsSync(path.join(tdir, 'context.md'))).toBe(true)
    expect(fs.existsSync(path.join(tdir, 'agentPrompt.md'))).toBe(true)

    // ensure not overwritten: write custom then seed again
    const ctx = path.join(tdir, 'context.md')
    fs.writeFileSync(ctx, 'CUSTOM', 'utf8')
    await seedTemplates(tmp)
    const got = fs.readFileSync(ctx, 'utf8')
    expect(got).toBe('CUSTOM')
  })
})
