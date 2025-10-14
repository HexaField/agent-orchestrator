import { execa } from 'execa';

export async function git(args: string[], opts: { cwd: string }) {
  const res = await execa('git', args, { cwd: opts.cwd, reject: false });
  return { stdout: res.stdout, stderr: res.stderr, exitCode: res.exitCode };
}
