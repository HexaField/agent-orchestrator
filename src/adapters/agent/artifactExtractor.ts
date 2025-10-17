import fs from 'fs'
import path from 'path'

export function createArtifactExtractor(sessionId: string, cwd: string) {
  let combined = ''
  const fences: string[] = []
  const markers: Array<{ path: string; content: string }> = []

  const fenceRe = /```(?:ts|typescript|js|javascript)?\n([\s\S]*?)\n```/gim
  const patchRe = /(^diff --git |^@@ )/m

  function process(ev: any) {
    try {
      if (!ev) return
      if (typeof ev === 'string') {
        combined += ev + '\n'
        return
      }
      if (typeof ev === 'object') {
        if (typeof ev.aggregated_output === 'string') combined += ev.aggregated_output + '\n'
        if (typeof ev.response === 'string') combined += ev.response + '\n'
        if (typeof ev.thinking === 'string') combined += ev.thinking + '\n'
        if (ev.item && typeof ev.item.text === 'string') combined += ev.item.text + '\n'
        return
      }
    } catch {}
  }

  async function finalize() {
    try {
      const outDir = path.join(cwd || '.', '.agent', 'runs')
      fs.mkdirSync(outDir, { recursive: true })
      const pth = path.join(outDir, `${sessionId}.patches.diff`)
      fs.writeFileSync(pth, combined, 'utf8')

      if (patchRe.test(combined)) {
        try {
          fs.writeFileSync(path.join(outDir, `${sessionId}.codex-generated.patch`), combined, 'utf8')
        } catch {}
      }

      try {
        const lines = combined.split(/\r?\n/)
        const headerRe = /^===\s*(.+?)\s*===$/
        let i = 0
        while (i < lines.length) {
          const h = lines[i].match(headerRe)
          if (h) {
            const rel = (h[1] || '').trim()
            i++
            const buf: string[] = []
            while (i < lines.length && !lines[i].match(headerRe)) {
              buf.push(lines[i])
              i++
            }
            const content = buf.join('\n') + '\n'
            try {
              const abs = path.join(cwd || '.', rel)
              fs.mkdirSync(path.dirname(abs), { recursive: true })
              fs.writeFileSync(abs, content, 'utf8')
              markers.push({ path: rel, content })
            } catch {}
            continue
          }
          i++
        }
      } catch {}

      let fm: RegExpExecArray | null
      while ((fm = fenceRe.exec(combined))) {
        try {
          let content = fm[1]
          const firstLine = (content.split(/\r?\n/)[0] || '').trim()
          const fileHeader = firstLine.match(/^\/\/\s*File:\s*(.+)$/i)
          if (fileHeader && fileHeader[1]) {
            const rel = fileHeader[1].trim()
            content = content.replace(
              new RegExp('^' + firstLine.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\r?\\n'),
              ''
            )
            const abs = path.join(cwd || '.', rel)
            fs.mkdirSync(path.dirname(abs), { recursive: true })
            fs.writeFileSync(abs, content, 'utf8')
          }
          fences.push(fm[1])
        } catch {}
      }

      return { markers, fences, combined }
    } catch {
      return { markers, fences, combined }
    }
  }

  return { process, finalize }
}

export type {}
