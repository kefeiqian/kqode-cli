import treeKill from 'tree-kill';

/**
 * Terminates a process and any descendants it spawned.
 *
 * Used for build/launch timeouts and disposal; `tree-kill` shells out to
 * `taskkill` on Windows and signals the process group on Unix, so an aborted
 * Cargo build cannot leave orphaned `rustc` children behind.
 */
export function killProcessTree(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }

  treeKill(pid, 'SIGKILL', () => {
    // Best-effort cleanup: a missing process is already gone.
  });
}

/** Accumulates stream output up to a byte ceiling for bounded diagnostics. */
export class CappedBuffer {
  private readonly chunks: Buffer[] = [];
  private size = 0;

  constructor(private readonly capBytes: number) {}

  append(chunk: Buffer): void {
    if (this.size >= this.capBytes) {
      return;
    }

    const remaining = this.capBytes - this.size;
    const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
    this.chunks.push(slice);
    this.size += slice.length;
  }

  toString(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}
