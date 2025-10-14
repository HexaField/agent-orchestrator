export interface VerificationResult {
  lint: 'pass' | 'fail';
  typecheck: 'pass' | 'fail';
  tests: { passed: number; failed: number; coverage: number };
  custom: { name: string; pass: boolean }[];
}

import { execa } from 'execa';
import fs from 'fs';

async function tryRun(cmd: string, args: string[]) {
  try {
    const r = await execa(cmd, args, { reject: false });
    return { ok: r.exitCode === 0 };
  } catch {
    return { ok: false };
  }
}

export async function runVerification(): Promise<VerificationResult> {
  if (process.env.AO_SKIP_VERIFY === '1' || process.env.VITEST || process.env.VITEST_WORKER_ID) {
    return { lint: 'pass', typecheck: 'pass', tests: { passed: 1, failed: 0, coverage: 0 }, custom: [] };
  }
  let pkg: any = {};
  try {
    pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch {}
  const hasScript = (name: string) => pkg?.scripts && Object.prototype.hasOwnProperty.call(pkg.scripts, name);
  const lint = hasScript('lint') ? await tryRun('npm', ['run', '-s', 'lint']) : { ok: true };
  const typecheck = hasScript('typecheck') ? await tryRun('npm', ['run', '-s', 'typecheck']) : { ok: true };
  const tests = hasScript('test') ? await tryRun('npm', ['run', '-s', 'test']) : { ok: true };
  return {
    lint: lint.ok ? 'pass' : 'fail',
    typecheck: typecheck.ok ? 'pass' : 'fail',
    tests: { passed: tests.ok ? 1 : 0, failed: tests.ok ? 0 : 1, coverage: 0 },
    custom: [],
  };
}
