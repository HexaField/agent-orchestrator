import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import nodeFs from './nodeFs'

describe('NodeFs adapter', () => {
  it('can read and write files', async () => {
    const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ao-fs-'))
    const file = path.join(tmp, 'a', 'file.txt')
    await nodeFs.write(file, 'hello')
    const content = await nodeFs.read(file)
    expect(content).toBe('hello')
  })

  it('diffs added, modified, and deleted files between two dirs', async () => {
    const base = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ao-base-'))
    const other = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ao-other-'))

    // base has file deleted.txt and common.txt
    await fs.promises.mkdir(path.join(base, 'sub'), { recursive: true })
    await fs.promises.writeFile(path.join(base, 'deleted.txt'), 'will be deleted')
    await fs.promises.writeFile(path.join(base, 'common.txt'), 'v1')

    // other has added.txt and common.txt modified
    await fs.promises.mkdir(path.join(other, 'sub'), { recursive: true })
    await fs.promises.writeFile(path.join(other, 'added.txt'), 'new')
    await fs.promises.writeFile(path.join(other, 'common.txt'), 'v2')

    const d = await nodeFs.diff(base, other)
    // Should include deleted, added, modified entries
    const types = d.files.map((f) => f.type)
    expect(types).toContain('deleted')
    expect(types).toContain('added')
    expect(types).toContain('modified')
  })
})
