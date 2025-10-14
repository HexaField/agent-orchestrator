import { execa } from 'execa';

const REDACT_KEYS = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD'];

export function redactEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v == null) continue;
    const upper = k.toUpperCase();
    if (REDACT_KEYS.some((rk) => upper.includes(rk))) {
      out[k] = 'REDACTED';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function runCommand(cmd: string, args: string[], opts: { cwd: string; timeoutMs?: number; env?: Record<string, string> }) {
  const cp = execa(cmd, args, {
    cwd: opts.cwd,
    timeout: opts.timeoutMs ?? 10 * 60_000,
    env: opts.env,
    reject: false,
  });
  const res = await cp;
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.exitCode ?? 0 };
}
