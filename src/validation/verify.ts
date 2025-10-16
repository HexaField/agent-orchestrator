import { execa } from 'execa'

export async function runVerification(cwd: string = process.cwd()) {
  // Environment override is respected first for tests/CI
  if (process.env.SKIP_VERIFY === '1' || process.env.SKIP_VERIFY === 'true') {
    return { skipped: true, lint: 'pass', typecheck: 'pass', tests: { passed: 0, failed: 0 } }
  }

  // dynamic import so tests can mock the config module before this file is evaluated
  try {
    const { getEffectiveConfig } = await import('../config')
    const cfg = await getEffectiveConfig(cwd)
    if (cfg && cfg.SKIP_VERIFY) {
      return { skipped: true, lint: 'pass', typecheck: 'pass', tests: { passed: 0, failed: 0 } }
    }
  } catch {
    // ignore config read/import errors and proceed with verification
  }

  let lint: 'pass' | 'fail' = 'pass'
  let typecheck: 'pass' | 'fail' = 'pass'

  try {
    await execa('npm', ['run', 'lint'], { cwd, timeout: 10 * 60_000 })
    lint = 'pass'
  } catch {
    lint = 'fail'
  }

  try {
    await execa('npm', ['run', 'typecheck'], { cwd, timeout: 10 * 60_000 })
    typecheck = 'pass'
  } catch {
    typecheck = 'fail'
  }

  return { skipped: false, lint, typecheck, tests: { passed: 0, failed: 0 } }
}
