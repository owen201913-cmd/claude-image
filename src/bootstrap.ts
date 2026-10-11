import { bootstrapServer } from './shared/platform-guard.js';

process.exitCode = await bootstrapServer({
  platform: process.platform,
  architecture: process.arch,
  loadServer: () => import('./server.js'),
  writeStderr: message => { process.stderr.write(message); },
});
