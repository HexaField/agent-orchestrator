import { exec } from 'child_process'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

async function findRejFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  async function walk(p: string) {
    let items: string[] = []
    try {
      items = await fs.readdir(p)
    } catch {
      return
    }
    for (const name of items) {
      const fp = path.join(p, name)
      let st
      try {
        st = await fs.stat(fp)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        await walk(fp)
      } else if (name.endsWith('.rej')) {
        results.push(fp)
      }
    }
  }
  await walk(dir)
  return results
}

async function copyRejFiles(rejFiles: string[], destDir: string, cwd: string): Promise<string[]> {
  const rels: string[] = []
  await fs.ensureDir(destDir)
  for (const f of rejFiles) {
    const rel = path.relative(cwd, f)
    const dest = path.join(destDir, rel)
    await fs.ensureDir(path.dirname(dest))
    try {
      await fs.copyFile(f, dest)
      rels.push(rel)
    } catch {}
  }
  return rels
}

async function runCmd(command: string, cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err && typeof (err as any).code === 'number' ? (err as any).code : null, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

export async function applyPatchesFromRun(cwd: string, runId: string): Promise<{ applied: boolean; path?: string }> {
  const p = path.join(cwd, '.agent', 'runs', runId, 'patches.diff')
  const exists = await fs.pathExists(p)
  if (!exists) return { applied: false }

  const attempts: Array<{ cmd: string; code: number | null; stdout: string; stderr: string }> = []

  // detect git repo
  const isGit = await runCmd('git rev-parse --is-inside-work-tree', cwd)
  if (isGit.code !== 0 || String(isGit.stdout || isGit.stderr).trim() !== 'true') {
    // non-git fallback: try applying with multiple strategies and write marker inside repo
    const cmds = [
      `git apply --index "${p}"`,
      `git apply --index --reject "${p}"`,
      `git apply --index --3way "${p}"`
    ]
    for (const cmd of cmds) {
      const res = await runCmd(cmd, cwd)
      attempts.push({ cmd, code: res.code, stdout: res.stdout, stderr: res.stderr })
      if (res.code === 0) return { applied: true, path: p }
    }
    try {
      const runsRejDir = path.join(cwd, '.agent', 'runs', runId, 'rejections')
      const rejFiles = await findRejFiles(cwd)
      let rejRels: string[] = []
      if (rejFiles.length > 0) {
        rejRels = await copyRejFiles(rejFiles, runsRejDir, cwd)
      }
      const marker = path.join(cwd, '.agent', 'runs', runId, 'applied.marker')
      const data: any = {
        applied: false,
        message: 'failed-to-apply',
        attempts: attempts.map((a) => ({ cmd: a.cmd, code: a.code, stderr: a.stderr.slice(0, 10 * 1024), stdout: a.stdout.slice(0, 10 * 1024) })),
        timestamp: new Date().toISOString()
      }
      if (rejRels.length > 0) data.rejections = rejRels
      await fs.ensureDir(path.dirname(marker))
      await fs.writeJson(marker, data, { spaces: 2 })
      return { applied: false, path: marker }
    } catch (e) {
      try {
        const marker = path.join(cwd, '.agent', 'runs', runId, 'applied.marker')
        await fs.ensureDir(path.dirname(marker))
        await fs.writeFile(marker, `failed-to-apply: ${String(e)}`)
        return { applied: false, path: marker }
      } catch {}
    }
    return { applied: false }
  }

  // transactional apply inside a temporary branch
  const origBranchRes = await runCmd('git rev-parse --abbrev-ref HEAD', cwd)
  const origBranch = String(origBranchRes.stdout || '').trim() || 'HEAD'
  const tempBranch = `ao-temp-${runId}-${Date.now()}`
  try {
    // create and switch to temp branch
    await runCmd(`git checkout -b "${tempBranch}"`, cwd)

    const cmds = [
      `git apply --index "${p}"`,
      `git apply --index --reject "${p}"`,
      `git apply --index --3way "${p}"`
    ]

    for (const cmd of cmds) {
      const res = await runCmd(cmd, cwd)
      attempts.push({ cmd, code: res.code, stdout: res.stdout, stderr: res.stderr })
      if (res.code === 0) {
        // merge temp branch back into original
        const checkoutRes = await runCmd(`git checkout "${origBranch}"`, cwd)
        if (checkoutRes.code !== 0) throw new Error('failed to checkout original branch')
        const mergeRes = await runCmd(`git merge --no-edit "${tempBranch}"`, cwd)
        if (mergeRes.code !== 0) throw new Error('merge failed after successful apply')
        // delete temp
        await runCmd(`git branch -D "${tempBranch}"`, cwd)
        return { applied: true, path: p }
      }
    }

    // failed on all attempts -> rollback
    // before cleaning up, preserve any .rej files created by git apply --reject
    const rejFiles = await findRejFiles(cwd)
    if (rejFiles.length > 0) {
      const outRejDir = path.join(os.tmpdir(), 'agent-orchestrator', 'runs', runId, 'rejections')
      try {
        await copyRejFiles(rejFiles, outRejDir, cwd)
      } catch {}
    }
    await runCmd(`git checkout "${origBranch}"`, cwd)
    // ensure no partial index / worktree
    await runCmd('git reset --hard', cwd)
    await runCmd('git clean -fdx', cwd)
    try {
      const runsDir = path.join(cwd, '.agent', 'runs')
      for (let i = 0; i < 3; i++) {
        try {
          await fs.remove(runsDir)
        } catch {}
        const still = await fs.pathExists(runsDir)
        if (!still) break
        // small delay
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 50))
      }
      // ensure removal via shell fallback
      try {
        await runCmd('rm -rf .agent/runs', cwd)
      } catch {}
    } catch {}

    // write marker outside the working tree so cleanup can leave the repo clean
    const outDir = path.join(os.tmpdir(), 'agent-orchestrator', 'runs', runId)
    await fs.ensureDir(outDir)
    const marker = path.join(outDir, 'applied.marker')
    const data: any = {
      applied: false,
      message: 'failed-to-apply',
      attempts: attempts.map((a) => ({ cmd: a.cmd, code: a.code, stderr: a.stderr.slice(0, 10 * 1024), stdout: a.stdout.slice(0, 10 * 1024) })),
      timestamp: new Date().toISOString()
    }
    // include any preserved rejections from the outDir location
    try {
      const rejDir = path.join(outDir, 'rejections')
      if (await fs.pathExists(rejDir)) {
        const walk: string[] = []
        async function collect(p: string) {
          const items = await fs.readdir(p)
          for (const name of items) {
            const fp = path.join(p, name)
            const st = await fs.stat(fp)
            if (st.isDirectory()) await collect(fp)
            else walk.push(path.relative(outDir, fp))
          }
        }
        await collect(rejDir)
        if (walk.length > 0) data.rejections = walk
      }
    } catch {}
    await fs.writeJson(marker, data, { spaces: 2 })
    // delete temp branch if it exists
    try {
      await runCmd(`git branch -D "${tempBranch}"`, cwd)
    } catch {}
    return { applied: false, path: marker }
  } catch (err) {
    // on unexpected error, attempt to cleanup and write marker
    try {
      await runCmd(`git checkout "${origBranch}"`, cwd)
    } catch {}
    try {
      await runCmd(`git reset --hard`, cwd)
      await runCmd('git clean -fdx', cwd)
      try {
        const runsDir = path.join(cwd, '.agent', 'runs')
        for (let i = 0; i < 3; i++) {
          try {
            await fs.remove(runsDir)
          } catch {}
          const still = await fs.pathExists(runsDir)
          if (!still) break
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 50))
        }
      } catch {}
      try {
        await runCmd('rm -rf .agent/runs', cwd)
      } catch {}
    } catch {}
    try {
      await runCmd(`git branch -D "${tempBranch}"`, cwd)
    } catch {}
    try {
      const outDir = path.join(os.tmpdir(), 'agent-orchestrator', 'runs', runId)
      await fs.ensureDir(outDir)
      const marker = path.join(outDir, 'applied.marker')
      const data = {
        applied: false,
        message: 'failed-to-apply',
        error: String(err),
        attempts: attempts.map((a) => ({ cmd: a.cmd, code: a.code, stderr: a.stderr.slice(0, 10 * 1024), stdout: a.stdout.slice(0, 10 * 1024) })),
        timestamp: new Date().toISOString()
      }
      await fs.writeJson(marker, data, { spaces: 2 })
      return { applied: false, path: marker }
    } catch {}
  }
  return { applied: false }
}
