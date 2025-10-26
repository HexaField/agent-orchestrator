export type DiffEntry = {
  path: string
  type: 'added' | 'modified' | 'deleted'
  diff?: string
}

export interface FsAdapter {
  read(path: string): Promise<string>
  write(path: string, content: string): Promise<void>
  /**
   * Diff two directories (basePath vs otherPath). Returns list of changed files with unified diffs when available.
   * @param basePath base directory
   * @param otherPath directory to compare against basePath
   */
  diff(basePath: string, otherPath: string, glob?: string): Promise<{ files: DiffEntry[] }>
}
