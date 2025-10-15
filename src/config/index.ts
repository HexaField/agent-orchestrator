import fs from 'fs-extra'
import path from 'path'
// loadConfig removed - project config seeding uses ConfigSchema defaults when creating a new file
import type { AppConfig } from './schema'
import { ConfigSchema } from './schema'

const CONFIG_NAME = 'config.json'

export async function ensureProjectConfig(cwd: string = process.cwd()): Promise<AppConfig> {
  const agentDir = path.join(cwd, '.agent')
  await fs.ensureDir(agentDir)
  const cfgPath = path.join(agentDir, CONFIG_NAME)
  // If config exists, read it and return. Do not force defaults into an existing file.
  if (await fs.pathExists(cfgPath)) {
    try {
      const raw = await fs.readJson(cfgPath)
      return raw as AppConfig
    } catch {
      // If the file is malformed, back it up and re-seed
      try {
        await fs.move(cfgPath, cfgPath + '.bak')
      } catch {}
    }
  }

  // create seeded config from schema defaults (no environment migration)
  const cfg = ConfigSchema.parse({}) as AppConfig
  try {
    await fs.writeJson(cfgPath, cfg, { spaces: 2 })
  } catch {
    // ignore write errors, return in-memory config
  }
  return cfg
}

export async function readProjectConfig(cwd: string = process.cwd()): Promise<AppConfig | null> {
  const cfgPath = path.join(cwd, '.agent', CONFIG_NAME)
  try {
    if (!(await fs.pathExists(cfgPath))) return null
    return (await fs.readJson(cfgPath)) as AppConfig
  } catch {
    return null
  }
}

export async function writeProjectConfig(cfg: AppConfig, cwd: string = process.cwd()): Promise<void> {
  const cfgPath = path.join(cwd, '.agent', CONFIG_NAME)
  await fs.ensureDir(path.dirname(cfgPath))
  await fs.writeJson(cfgPath, cfg, { spaces: 2 })
}

export { AppConfig }
