import fs from 'fs'
import path from 'path'
import type { AgentAdapter } from '../../types/adapters'

export function createReplayAgent(): AgentAdapter {
  return {
    name: 'agent-replay',
    async run(input) {
      // Allow tests to select which fixture via AO_REPLAY_FIXTURE env or default to the bundled one
      // Prefer explicit input.env override, otherwise read the project config fixture
  // prefer explicit per-invocation env override (REPLAY_FIXTURE), then project config, then default
  let fixture = String(input.env?.REPLAY_FIXTURE ?? '')
      try {
        const { readProjectConfig } = await import('../../config')
        const cfg = await readProjectConfig(input.cwd || '.')
        if (cfg) {
          if (!fixture) fixture = String((cfg as any).REPLAY_FIXTURE ?? '')
        }
      } catch {}
      if (!fixture) fixture = 'WORK-1760471752835'

      // Determine how many runs are already present in this workdir so we can
      // pick the next sequenced fixture (run-1.json, run-2.json, ...).
      const runsDir = path.join(input.cwd || '.', '.agent', 'runs')
      let existingRuns: string[] = []
      try {
        existingRuns = fs.existsSync(runsDir) ? fs.readdirSync(runsDir) : []
      } catch {}
      const nextIndex = existingRuns.length + 1

      // Determine repository root by walking up from the bundle file (import.meta.url)
      // or from process.cwd() as a fallback. Then use repoRoot/tests/e2e/fixtures/replay
      let repoRootCandidates: string[] = []
      try {
        const bundleDir = path.dirname(new URL(import.meta.url).pathname)
        // Walk up a few levels looking for package.json
        let cur = bundleDir
        for (let i = 0; i < 6; i++) {
          repoRootCandidates.push(cur)
          cur = path.resolve(cur, '..')
        }
      } catch {}
      try {
        // also include process.cwd() and its parents
        let cur2 = process.cwd()
        for (let i = 0; i < 6; i++) {
          repoRootCandidates.push(cur2)
          cur2 = path.resolve(cur2, '..')
        }
      } catch {}

      let repoRoot = ''
      for (const c of repoRootCandidates) {
        try {
          if (fs.existsSync(path.join(c, 'package.json'))) {
            repoRoot = c
            break
          }
        } catch {}
      }
      if (!repoRoot) repoRoot = path.resolve(process.cwd(), '..')

      const baseCandidates = [path.join(repoRoot, 'tests', 'e2e', 'fixtures', 'replay')]

      // If the requested fixture doesn't exist, attempt to pick the first available fixture directory
      let fixtureRootFound = false
      for (const base of baseCandidates) {
        try {
          if (!fs.existsSync(base)) continue
          const cand = path.join(base, fixture)
          if (fs.existsSync(cand)) {
            fixtureRootFound = true
            break
          }
        } catch {}
      }
      if (!fixtureRootFound) {
        // choose first available fixture folder
        for (const base of baseCandidates) {
          try {
            if (!fs.existsSync(base)) continue
            const entries = fs.readdirSync(base).filter((e) => fs.statSync(path.join(base, e)).isDirectory())
            if (entries && entries.length > 0) {
              fixture = entries[0]
              fixtureRootFound = true
              break
            }
          } catch {}
        }
      }

      // Try sequenced run files first (run-<nextIndex>.json), but if the
      // exact index isn't present pick the highest available run-<i>.json where
      // i <= nextIndex. Then fall back to run.json. As a final fallback scan
      // all fixture subfolders.
      let data: any
      let found = false
      try {
        try {
          console.error(
            'replay adapter debug: input.cwd=',
            input.cwd,
            'runsDir=',
            runsDir,
            'existingRuns=',
            existingRuns,
            'nextIndex=',
            nextIndex,
            'fixture=',
            fixture
          )
        } catch {}

        for (const base of baseCandidates) {
          const fixtureDir = path.join(base, fixture)
          if (!fs.existsSync(fixtureDir)) continue

          // prefer exact match
          const exact = path.join(fixtureDir, `run-${nextIndex}.json`)
          if (fs.existsSync(exact)) {
            data = JSON.parse(fs.readFileSync(exact, 'utf8'))
            found = true
            break
          }

          // find all run-<n>.json files and pick the highest index <= nextIndex
          const entries = fs.readdirSync(fixtureDir).filter((e) => /^run-\d+\.json$/.test(e))
          if (entries.length > 0) {
            const indices = entries
              .map((e) => {
                const m = /^run-(\d+)\.json$/.exec(e)
                return m ? parseInt(m[1], 10) : NaN
              })
              .filter((n) => !Number.isNaN(n))
              .sort((a, b) => a - b)

            // pick the largest index <= nextIndex, otherwise pick the largest available
            let pickIndex: number | null = null
            for (let i = indices.length - 1; i >= 0; i--) {
              if (indices[i] <= nextIndex) {
                pickIndex = indices[i]
                break
              }
            }
            if (pickIndex === null && indices.length > 0) pickIndex = indices[indices.length - 1]

            // If the test harness added an extra.test.ts file (the 'changes_requested' flow),
            // prefer any run-<n>.json that contains whatDone: 'awaiting_review' so the replay
            // selection matches the new repo state after the test was added.
            const extraTestPath = path.join(input.cwd || '.', 'extra.test.ts')
            if (fs.existsSync(extraTestPath)) {
              // search for any run file with awaiting_review
              for (let i = indices.length - 1; i >= 0; i--) {
                const candidate = path.join(fixtureDir, `run-${indices[i]}.json`)
                try {
                  if (!fs.existsSync(candidate)) continue
                  const candData = JSON.parse(fs.readFileSync(candidate, 'utf8'))
                  if (
                    candData &&
                    (candData.whatDone === 'awaiting_review' ||
                      candData.whatDone === 'ready_to_commit' ||
                      candData.whatDone === 'spec_implemented')
                  ) {
                    data = candData
                    found = true
                    break
                  }
                } catch {}
              }
              if (found) break
            }

            if (pickIndex !== null) {
              const p = path.join(fixtureDir, `run-${pickIndex}.json`)
              if (fs.existsSync(p)) {
                data = JSON.parse(fs.readFileSync(p, 'utf8'))
                found = true
                break
              }
            }
          }

          // try run.json fallback
          const single = path.join(fixtureDir, 'run.json')
          if (fs.existsSync(single)) {
            data = JSON.parse(fs.readFileSync(single, 'utf8'))
            found = true
            break
          }
        }
      } catch {}

      // Last-resort: if still not found, scan all fixture subfolders and pick the first run.json or run-<n>.json we can find.
      if (!found) {
        const fallbackNames = ['run.json', 'run-1.json']
        for (const base of baseCandidates) {
          try {
            if (!fs.existsSync(base)) continue
            const entries = fs.readdirSync(base).filter((e) => fs.statSync(path.join(base, e)).isDirectory())
            for (const e of entries) {
              try {
                const fixtureDir = path.join(base, e)
                // try run.json first
                for (const n of fallbackNames) {
                  const p = path.join(fixtureDir, n)
                  if (fs.existsSync(p)) {
                    try {
                      data = JSON.parse(fs.readFileSync(p, 'utf8'))
                      found = true
                      fixture = e
                      break
                    } catch {}
                  }
                }
                if (found) break

                // otherwise try any run-<num>.json
                const entriesFiles = fs.readdirSync(fixtureDir).filter((f) => /^run-\d+\.json$/.test(f))
                if (entriesFiles.length > 0) {
                  // pick the first available
                  const p2 = path.join(fixtureDir, entriesFiles[0])
                  try {
                    data = JSON.parse(fs.readFileSync(p2, 'utf8'))
                    found = true
                    fixture = e
                    break
                  } catch {}
                }
              } catch {}
              if (found) break
            }
            if (found) break
          } catch {}
        }
      }

      if (!found) {
        try {
          console.error('replay adapter: failed to find fixture', fixture, 'baseCandidates=', baseCandidates)
        } catch {}
        // instead of throwing, pick the first available fixture folder if any
        for (const base of baseCandidates) {
          try {
            if (!fs.existsSync(base)) continue
            const entries = fs.readdirSync(base).filter((e) => fs.statSync(path.join(base, e)).isDirectory())
            if (entries && entries.length > 0) {
              const fallback = path.join(base, entries[0])
              // try run.json or run-1.json
              const rj = path.join(fallback, 'run.json')
              const r1 = path.join(fallback, 'run-1.json')
              if (fs.existsSync(rj)) {
                data = JSON.parse(fs.readFileSync(rj, 'utf8'))
                found = true
                fixture = entries[0]
                break
              }
              if (fs.existsSync(r1)) {
                data = JSON.parse(fs.readFileSync(r1, 'utf8'))
                found = true
                fixture = entries[0]
                break
              }
            }
          } catch {}
        }
        if (!found) throw new Error('missing fixture for ' + fixture)
      }
      // Simulate the runCommand return shape used by orchestrator: a promise resolving to stdout/stderr
      // We'll write the data into the .agent/runs/<runId>/run.json location so the rest of the system can read it.
      const outDir = path.join(input.cwd || '.', '.agent', 'runs', data.runId)
      try {
        fs.mkdirSync(outDir, { recursive: true })
      } catch {}
      fs.writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(data, null, 2), 'utf8')
      // If a patches.diff is present in the fixture dir, copy it into the run dir
      const patchSrc = path.resolve(
        path.dirname(new URL(import.meta.url).pathname),
        '../../../tests/e2e/fixtures/replay',
        fixture,
        'patches.diff'
      )
      if (fs.existsSync(patchSrc)) {
        try {
          fs.copyFileSync(patchSrc, path.join(outDir, 'patches.diff'))
        } catch {}
      }

      return {
        stdout: JSON.stringify(data.outputs && data.outputs.stdout ? data.outputs.stdout : ''),
        stderr: JSON.stringify(data.outputs && data.outputs.stderr ? data.outputs.stderr : ''),
        exitCode: 0
      }
    }
  }
}

export default createReplayAgent
