import fs from 'fs-extra'
import path from 'path'
// loadConfig removed - project config seeding uses ConfigSchema defaults when creating a new file
import type { AppConfig } from './schema'
import { ConfigSchema } from './schema'
import { loadConfig } from './defaults'

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

export async function writeProjectConfig(cfg: AppConfig, cwd: string = process.cwd()): Promise<void> {
  const cfgPath = path.join(cwd, '.agent', CONFIG_NAME)
  await fs.ensureDir(path.dirname(cfgPath))
  await fs.writeJson(cfgPath, cfg, { spaces: 2 })
}

/**
 * Return an effective configuration by merging environment-based config and
 * project config. Precedence: project config overrides environment values.
 */
export async function getEffectiveConfig(
  cwd: string = process.cwd(),
  env: Record<string, string | undefined> = {}
): Promise<AppConfig> {
  // Load env-based config tolerant (non-strict) from provided env map
  const envCfg = loadConfig(env)

  // Load (or seed) project config via ensureProjectConfig which returns the
  // project config or creates a seeded one from schema defaults. This replaces
  // the previous two-step read/seed behavior and centralizes project config IO.
  const projectCfg = await ensureProjectConfig(cwd)

  // Merge: project overrides env. Only copy keys present in schema (shallow merge).
  const merged: any = { ...envCfg, ...projectCfg }
  // Ensure result conforms to AppConfig shape by parsing defaults from schema
  try {
    // parse will fill defaults for missing values
    return ConfigSchema.parse(merged) as AppConfig
  } catch {
    // If parsing fails, fall back to project config (which should have been seeded)
    return projectCfg as AppConfig
  }
}

export { AppConfig }
