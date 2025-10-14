import { ConfigSchema, type AppConfig } from './schema'

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error('Invalid configuration: ' + parsed.error.message)
  }
  return parsed.data
}
