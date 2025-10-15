import { ConfigSchema, type AppConfig } from './schema'

/**
 * Load configuration from environment-like object.
 *
 * By default this function is tolerant: invalid environment values will be
 * ignored and the schema defaults will be returned instead. Set `strict=true`
 * to throw on parse errors (useful for tests or CI where silent fallbacks
 * are undesirable).
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  options?: { strict?: boolean }
): AppConfig {
  const parsed = ConfigSchema.safeParse(env)
  if (!parsed.success) {
    if (options && options.strict) {
      throw new Error('Invalid configuration: ' + parsed.error.message)
    }
    // Non-strict: return schema defaults instead of throwing
    return ConfigSchema.parse({}) as AppConfig
  }
  return parsed.data
}
