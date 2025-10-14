import fs from 'fs'
import fsExtra from 'fs-extra'
import path from 'path'

const STALE_MS = 1000 * 60 * 5 // 5 minutes

export async function withLock<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const lockDir = path.join(cwd, '.agent')
  const lockPath = path.join(lockDir, 'lock')
  await fsExtra.ensureDir(lockDir)

  // Attempt atomic creation using fs.open with 'wx' flag.
  try {
    const fd = await fs.promises.open(lockPath, 'wx')
    try {
      const payload = JSON.stringify({ pid: process.pid, ts: Date.now() })
      await fd.writeFile(payload, 'utf8')
      await fd.sync()
    } finally {
      await fd.close()
    }
  } catch (err) {
    // If file exists, check for staleness
    try {
      const stat = await fs.promises.stat(lockPath)
      const raw = await fs.promises.readFile(lockPath, 'utf8').catch(() => '')
      let meta: any = {}
      try {
        meta = JSON.parse(raw || '{}')
      } catch {}
      const age = Date.now() - (meta.ts || stat.mtimeMs || 0)
      if (age > STALE_MS) {
        // stale lock detected — remove and retry create
        await fs.promises.unlink(lockPath)
        const fd2 = await fs.promises.open(lockPath, 'wx')
        try {
          const payload = JSON.stringify({ pid: process.pid, ts: Date.now(), recovered: true })
          await fd2.writeFile(payload, 'utf8')
          await fd2.sync()
        } finally {
          await fd2.close()
        }
      } else {
        throw new Error('Another run is in progress')
      }
    } catch (e) {
      // rethrow original reason if not stale removal
      if ((e as Error).message === 'Another run is in progress') throw e
      throw err
    }
  }

  try {
    return await fn()
  } finally {
    try {
      await fs.promises.unlink(lockPath)
    } catch {}
  }
}
