export interface BootstrapOptions {
  platform: string;
  architecture: string;
  loadServer: () => Promise<unknown>;
  writeStderr: (message: string) => void;
}

/** Keep this module dependency-free: native modules must load only after this check. */
export async function bootstrapServer(options: BootstrapOptions): Promise<0 | 1> {
  const failure = options.platform !== 'win32'
    ? { code: 'UNSUPPORTED_PLATFORM', message: 'Claude Image currently supports Windows x64 only. Install this MCPB on a Windows x64 system.' }
    : options.architecture !== 'x64'
      ? { code: 'UNSUPPORTED_ARCHITECTURE', message: 'Claude Image requires an x64 Node.js runtime on Windows. Native ARM64 and 32-bit runtimes are not supported by this MCPB.' }
      : undefined;
  if (failure) {
    options.writeStderr(`${JSON.stringify({ event: 'startup_failed', ...failure })}\n`);
    return 1;
  }
  try {
    await options.loadServer();
    return 0;
  } catch {
    options.writeStderr(`${JSON.stringify({ event: 'startup_failed', code: 'STARTUP_FAILED',
      message: 'Claude Image could not start. Check the extension installation and runtime requirements. No generation was submitted by this startup check.' })}\n`);
    return 1;
  }
}
