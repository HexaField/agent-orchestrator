import { exec } from 'child_process'
import fs from 'fs-extra'
import path from 'path'

export async function applyPatchesFromRun(cwd: string, runId: string): Promise<{ applied: boolean; path?: string }> {
  const p = path.join(cwd, '.agent', 'runs', runId, 'patches.diff')
  const exists = await fs.pathExists(p)
  if (!exists) return { applied: false }
  // Try to apply via git apply --index
  try {
    await new Promise<void>((resolve, reject) => {
      exec(`git apply --index "${p}"`, { cwd }, (err, _stdout, stderr) => {
        if (err) return reject(new Error(String(stderr || err)))
        resolve()
      })
    })
    return { applied: true, path: p }
  } catch (err) {
    // as a fallback, write an applied marker
    try {
      const marker = path.join(cwd, '.agent', 'runs', runId, 'applied.marker')
      await fs.writeFile(marker, `failed-to-apply:${String(err)}`)
      return { applied: false, path: marker }
    } catch {}
    return { applied: false }
  }
}
