import { execa } from 'execa';

export async function git(args: string[], opts: { cwd: string }) {
  const res = await execa('git', args, { cwd: opts.cwd, reject: false });
  return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode };
}

export async function gitDiffNameOnly(opts: { cwd: string }) {
  try {
    const r = await git(['diff', '--name-only', 'HEAD'], { cwd: opts.cwd });
    if (r.exitCode !== 0) return [];
    return r.stdout ? r.stdout.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function gitDiffFull(opts: { cwd: string; maxChars?: number }) {
  try {
    const r = await git(['diff', 'HEAD'], { cwd: opts.cwd });
    if (r.exitCode !== 0) return '';
    if (opts.maxChars && r.stdout.length > opts.maxChars)
      return r.stdout.slice(0, opts.maxChars) + '\n...(truncated)';
    return r.stdout || '';
  } catch {
    return '';
  }
}
