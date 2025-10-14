import fs from 'fs-extra';
import path from 'path';

export async function withLock<T>(cwd: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = path.join(cwd, '.agent', 'lock');
  await fs.ensureDir(path.dirname(lockPath));
  const exists = await fs.pathExists(lockPath);
  if (exists) throw new Error('Another run is in progress');
  await fs.writeFile(lockPath, String(process.pid), 'utf8');
  try {
    return await fn();
  } finally {
    await fs.remove(lockPath);
  }
}
