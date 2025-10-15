import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { seedTemplates } from '../../src/core/templateLoader'
import * as templates from '../../src/core/templates'

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ao-test-'))
}

describe('core templates integration', () => {
  it('uses file-based context template when present', async () => {
    const tmp = makeTmpDir()
    // create .agent/templates and seed defaults
    await seedTemplates(tmp)
    const tdir = path.join(tmp, '.agent', 'templates')
    fs.writeFileSync(path.join(tdir, 'context.md'), 'CTX: %summary%', 'utf8')

    // temporarily chdir to tmp to ensure process.cwd() used by templates
    const orig = process.cwd()
    process.chdir(tmp)
    try {
      const out = templates.genContext('Line1\nLine2\nLine3')
      expect(out).toBe('CTX: Line1 Line2 Line3')
    } finally {
      process.chdir(orig)
    }
  })

  it('clarify uses the clarify.md template when present', async () => {
    const tmp = makeTmpDir()
    await seedTemplates(tmp)
    const tdir = path.join(tmp, '.agent', 'templates')
    fs.writeFileSync(path.join(tdir, 'clarify.md'), 'CLARIFY: %spec%', 'utf8')

    const orig = process.cwd()
    process.chdir(tmp)
    try {
      const spec = '# Title\n\n## Feature A\n\nDetails\n\n## Feature B\n'
      const out = templates.genClarify(spec)
      expect(out).toBe('CLARIFY: ' + spec)
    } finally {
      process.chdir(orig)
    }
  })
})
