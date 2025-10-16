import fs from 'fs-extra'
import path from 'path'

export async function seedEmptyProgress(tmpDir: string) {
  const p = path.join(tmpDir, 'progress.json')
  const doc = { checklist: [] }
  await fs.ensureDir(path.dirname(p))
  await fs.writeFile(p, JSON.stringify(doc, null, 2), 'utf8')
}

export default seedEmptyProgress
