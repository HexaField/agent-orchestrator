import fs from 'fs-extra'
import path from 'path'

export async function ensureDir(dir: string): Promise<void> {
  await fs.ensureDir(dir)
}

export async function writeJsonAtomic<T>(file: string, data: T): Promise<void> {
  await ensureDir(path.dirname(file))
  const tmp = file + '.tmp'
  await fs.writeJson(tmp, data, { spaces: 2 })
  await fs.move(tmp, file, { overwrite: true })
}

export async function readJsonSafe<T>(file: string, fallback: T): Promise<T> {
  try {
    return await fs.readJson(file)
  } catch {
    return fallback
  }
}

export async function writeFileAtomic(file: string, content: string): Promise<void> {
  await ensureDir(path.dirname(file))
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, content, 'utf8')
  await fs.move(tmp, file, { overwrite: true })
}
