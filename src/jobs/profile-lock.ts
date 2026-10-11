import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, stat, unlink } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { BridgeError } from '../shared/errors.js';

interface LockOwner { pid: number; token: string; created_at: string }

export function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Exclusive local process lock; no public port and no browser-profile reset. */
export class ProfileLock {
  private released = false;
  private constructor(readonly lockPath: string, private readonly token: string, private readonly server?: Server) {}

  static async acquire(directory: string, options: { name?: string; wait_ms?: number } = {}): Promise<ProfileLock> {
    await mkdir(directory, { recursive: true });
    const name = options.name ?? '.ngini-profile.lock';
    if (!/^\.[a-z0-9-]+\.lock$/i.test(name)) throw new BridgeError('INVALID_ARGUMENT', '不合法的鎖定檔名。');
    const lockPath = path.join(directory, name);
    const deadline = Date.now() + (options.wait_ms ?? 0);
    const token = randomUUID();
    if (process.platform === 'win32') {
      // Windows owns the named pipe. Exclusivity and crash release are atomic,
      // unlike a read/check/delete stale-file sequence. No TCP port is exposed.
      const identity = `${(await realpath(directory)).toLowerCase()}|${name.toLowerCase()}`;
      const pipe = `\\\\.\\pipe\\ngini-lock-${createHash('sha256').update(identity).digest('hex')}`;
      for (;;) {
        let server: Server;
        try { server = await listenForLock(pipe); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
          if (Date.now() >= deadline) throw new BridgeError('BUSY', '本工具的專用瀏覽器工作階段已被使用。');
          await delay(Math.min(25, Math.max(1, deadline - Date.now())));
          continue;
        }
        try {
          await writeOwner(lockPath, { pid: process.pid, token, created_at: new Date().toISOString() });
          return new ProfileLock(lockPath, token, server);
        } catch (error) {
          await closeServer(server);
          throw error;
        }
      }
    }
    for (;;) {
      try {
        const file = await open(lockPath, 'wx', 0o600);
        try {
          const owner: LockOwner = { pid: process.pid, token, created_at: new Date().toISOString() };
          await file.writeFile(JSON.stringify(owner));
          await file.sync();
        } finally { await file.close(); }
        return new ProfileLock(lockPath, token);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      if (await removeDeadLock(lockPath)) continue;
      if (Date.now() >= deadline) throw new BridgeError('BUSY', '本工具的專用瀏覽器工作階段已被使用。');
      await delay(Math.min(25, Math.max(1, deadline - Date.now())));
    }
  }

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    try {
      const owner = JSON.parse(await readFile(this.lockPath, 'utf8')) as LockOwner;
      if (owner.token === this.token) await unlink(this.lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    } finally { if (this.server) await closeServer(this.server); }
  }
}

function listenForLock(pipe: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => { socket.destroy(); });
    const failed = (error: Error): void => { reject(error); };
    server.once('error', failed);
    server.listen({ path: pipe, exclusive: true }, () => {
      server.removeListener('error', failed);
      // The pipe has no request handler or data protocol; it is only a mutex.
      server.on('error', () => undefined);
      server.unref();
      resolve(server);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function writeOwner(lockPath: string, owner: LockOwner): Promise<void> {
  const temporary = `${lockPath}.${owner.token}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(owner)); await file.sync(); }
    finally { await file.close(); }
    await rename(temporary, lockPath);
  } finally { await unlink(temporary).catch(() => undefined); }
}

async function removeDeadLock(lockPath: string): Promise<boolean> {
  try {
    const original = await readFile(lockPath, 'utf8');
    let stale = false;
    try {
      const owner = JSON.parse(original) as Partial<LockOwner>;
      stale = Number.isSafeInteger(owner.pid) && !processIsAlive(owner.pid ?? 0);
    } catch {
      // A newly created file can be momentarily empty while its owner writes it.
      stale = Date.now() - (await stat(lockPath)).mtimeMs > 60_000;
    }
    if (!stale || await readFile(lockPath, 'utf8') !== original) return false;
    await unlink(lockPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
    throw error;
  }
}
