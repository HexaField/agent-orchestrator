import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { DiffEntry, FsAdapter } from './interface'

const DEBUG = !!process.env.AO_DEBUG

/**
 * NodeFs: basic read/write and directory diffing using system `diff -ru`.
 * This keeps the implementation small and deterministic on POSIX systems (macOS, Linux).
 */
const nodeFs: FsAdapter = {
  async read(p: string): Promise<string> {
    return fs.promises.readFile(p, { encoding: 'utf8' })
  },

  async write(p: string, content: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(p), { recursive: true })
    await fs.promises.writeFile(p, content, { encoding: 'utf8' })
  },

  async diff(basePath: string, otherPath: string): Promise<{ files: DiffEntry[] }> {
    // Use system diff for a unified diff. Many Unix environments have `diff` available.
    // diff returns 0 when identical, 1 when differences, >1 on error.
    const res = spawnSync('diff', ['-ru', basePath, otherPath], { encoding: 'utf8' })

    if (res.status === null) {
      // process spawn failure
      throw new Error('Failed to run diff: ' + (res.error?.message || 'unknown'))
    }

    const out = res.stdout || ''
    const lines = out.split(/\r?\n/)
    const files: DiffEntry[] = []

    // Parse 'Only in' lines (added/deleted) and diff headers for modified files
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      // handle "Only in <dir>: <file>" lines robustly
      if (line.startsWith('Only in ')) {
        const rest = line.slice('Only in '.length)
        const sep = rest.indexOf(':')
        if (sep !== -1) {
          const dir = rest.slice(0, sep).trim()
          const file = rest.slice(sep + 1).trim()
          const full = path.join(dir, file)
          // robust detection by checking existence in each tree
          try {
            const rel = path.relative(dir, full)
            const inBase = fs.existsSync(path.join(basePath, rel))
            const inOther = fs.existsSync(path.join(otherPath, rel))
            if (inBase && !inOther) {
              if (DEBUG) console.log('parsed Only in -> deleted', dir, file)
              files.push({ path: path.relative(basePath, full), type: 'deleted' })
            } else if (inOther && !inBase) {
              if (DEBUG) console.log('parsed Only in -> added', dir, file)
              files.push({ path: path.relative(otherPath, full), type: 'added' })
            } else {
              if (DEBUG) console.log('parsed Only in -> modified(fallback)', dir, file, { inBase, inOther })
              files.push({ path: file, type: 'modified' })
            }
          } catch (_e) {
            files.push({ path: file, type: 'modified' })
          }
          continue
        }
      }

      const diffHeader = line.match(/^diff -ru (?:.*?) (?:.*?)$/)
      if (diffHeader) {
        // next lines include unified diff; collect until next 'diff -ru' or end
        let j = i + 1
        const blockLines = [line]
        while (j < lines.length && !lines[j].startsWith('diff -ru')) {
          blockLines.push(lines[j])
          j++
        }
        // attempt to extract file path from --- +++ headers
        const headerLine = blockLines.find((l) => l.startsWith('--- '))
        const plusLine = blockLines.find((l) => l.startsWith('+++ '))
        let relPath = ''
        if (headerLine && plusLine) {
          // --- a/path  and +++ b/path
          const a = headerLine.split('\t')[0].slice(4).replace(/^a\//, '')
          const b = plusLine.split('\t')[0].slice(4).replace(/^b\//, '')
          relPath = a === b ? a : b || a
        }

        // check for any 'Only in' lines embedded in the block (diff sometimes appends them)
        const onlyInLines = blockLines.filter((l) => l.startsWith('Only in '))
        for (const onlyLine of onlyInLines) {
          const rest = onlyLine.slice('Only in '.length)
          const sep2 = rest.indexOf(':')
          if (sep2 !== -1) {
            const dir2 = rest.slice(0, sep2).trim()
            const file2 = rest.slice(sep2 + 1).trim()
            try {
              const rel = path.relative(dir2, path.join(dir2, file2))
              const inBase2 = fs.existsSync(path.join(basePath, rel))
              const inOther2 = fs.existsSync(path.join(otherPath, rel))
              if (inBase2 && !inOther2)
                files.push({ path: path.relative(basePath, path.join(dir2, file2)), type: 'deleted' })
              else if (inOther2 && !inBase2)
                files.push({ path: path.relative(otherPath, path.join(dir2, file2)), type: 'added' })
              else files.push({ path: file2, type: 'modified' })
            } catch (_e) {
              files.push({ path: file2, type: 'modified' })
            }
          }
        }

        // remove only-in lines from the diff content
        const diffContent = blockLines.filter((l) => !l.startsWith('Only in ')).join('\n')
        if (diffContent.includes('\n--- ') || diffContent.includes('\n+++ ') || diffContent.startsWith('--- ')) {
          files.push({ path: relPath || 'unknown', type: 'modified', diff: diffContent })
        }

        i = j - 1
      }

      // handle lines like: "Files /path/a and /path/b differ"
      const filesDiffer = line.match(/^Files (.*) and (.*) differ$/)
      if (filesDiffer) {
        const a = filesDiffer[1]
        const b = filesDiffer[2]
        // prefer path relative to otherPath when possible
        let rel = ''
        try {
          if (a.startsWith(basePath)) rel = path.relative(basePath, a)
          else if (b.startsWith(otherPath)) rel = path.relative(otherPath, b)
          else rel = path.basename(a)
        } catch (_e) {
          rel = path.basename(a)
        }
        files.push({ path: rel, type: 'modified' })
      }
    }

    return { files }
  }
}

export default nodeFs
