/**
 * SessionManager: monitors session health, enforces idle timeouts, and
 * attempts reconnection via a provided reconnect callback.
 */
type ReconnectFn = () => Promise<any>

export interface SessionMeta {
  id: string
  lastActivity: number
  reconnectFn?: ReconnectFn
  attemptsLeft: number
}

export class SessionManager {
  private sessions: Map<string, SessionMeta> = new Map()
  private interval: any = null
  constructor(private opts: { checkIntervalMs?: number; idleTimeoutMs?: number; maxReconnectAttempts?: number } = {}) {
    this.opts = Object.assign(
      { checkIntervalMs: 5000, idleTimeoutMs: 1000 * 60 * 5, maxReconnectAttempts: 3 },
      this.opts
    )
    this.start()
  }

  start() {
    if (this.interval) return
    this.interval = setInterval(() => this.checkSessions(), this.opts.checkIntervalMs)
    if (this.interval.unref) this.interval.unref()
  }

  stop() {
    if (!this.interval) return
    clearInterval(this.interval)
    this.interval = null
  }

  create(id: string, reconnectFn?: ReconnectFn) {
    const meta: SessionMeta = {
      id,
      lastActivity: Date.now(),
      reconnectFn,
      attemptsLeft: this.opts.maxReconnectAttempts!
    }
    this.sessions.set(id, meta)
    return meta
  }

  touch(id: string) {
    const m = this.sessions.get(id)
    if (!m) return
    m.lastActivity = Date.now()
  }

  close(id: string) {
    this.sessions.delete(id)
  }

  private async checkSessions() {
    const now = Date.now()
    for (const [, meta] of Array.from(this.sessions.entries())) {
      const idle = now - meta.lastActivity
      if (idle > (this.opts.idleTimeoutMs || 0)) {
        // attempt reconnect if possible
        if (meta.reconnectFn && meta.attemptsLeft > 0) {
          meta.attemptsLeft -= 1
          try {
            const ok = await meta.reconnectFn()
            if (ok) {
              meta.lastActivity = Date.now()
              meta.attemptsLeft = this.opts.maxReconnectAttempts || 3
            }
          } catch {
            // swallow and retry later until attempts exhausted
          }
        }
      }
    }
  }
}

// export a default shared manager for adapters to use
export const sharedSessionManager = new SessionManager()
