import fs from 'fs-extra'
import path from 'path'

export async function ensureDir(dir: string): Promise<void> {
  await fs.ensureDir(dir)
}

export async function writeJsonAtomic<T>(file: string, data: T): Promise<void> {
  await ensureDir(path.dirname(file))
  const tmp = file + '.tmp'
  await fs.writeJson(tmp, data, { spaces: 2 })
  try {
    await fs.move(tmp, file, { overwrite: true })
  } catch (err) {
    // fallback: copy and remove tmp in case a direct move/rename fails
    try {
      await fs.copy(tmp, file, { overwrite: true })
    } finally {
      try {
        await fs.remove(tmp)
      } catch {}
    }
  }
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
  try {
    await fs.move(tmp, file, { overwrite: true })
  } catch (err) {
    try {
      await fs.copy(tmp, file, { overwrite: true })
    } finally {
      try {
        await fs.remove(tmp)
      } catch {}
    }
  }
}
