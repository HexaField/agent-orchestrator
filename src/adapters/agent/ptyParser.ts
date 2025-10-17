import fs from 'fs'
import path from 'path'

type Event = { type: 'json'; value: any } | { type: 'raw'; value: string }

export function createPtyParser(sessionId?: string, cwd?: string) {
  let buf = ''
  const queue: Event[] = []
  const ansiRe = /\x1B\[[0-?]*[ -\/]*[@-~]/g

  function persist(chunk: string) {
    if (!sessionId || !cwd) return
    try {
      const outDir = path.join(cwd || '.', '.agent', 'runs')
      fs.mkdirSync(outDir, { recursive: true })
      fs.appendFileSync(path.join(outDir, `${sessionId}.session.log`), chunk, 'utf8')
    } catch {}
  }

  function push(data: string) {
    if (!data) return
    buf += data
    persist(data)
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() || ''
    for (const ln of lines) {
      const cleaned = ln.replace(ansiRe, '').trim()
      if (!cleaned) continue
      try {
        const obj = JSON.parse(cleaned)
        queue.push({ type: 'json', value: obj })
      } catch {
        queue.push({ type: 'raw', value: cleaned })
      }
    }
  }

  function drain(): Event[] {
    const out = queue.splice(0)
    return out
  }

  function flush() {
    if (!buf) return
    const cleaned = buf.replace(ansiRe, '').trim()
    if (!cleaned) return
    try {
      const obj = JSON.parse(cleaned)
      queue.push({ type: 'json', value: obj })
    } catch {
      queue.push({ type: 'raw', value: cleaned })
    }
    buf = ''
  }

  return { push, drain, flush }
}

export type { Event }
