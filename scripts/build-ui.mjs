import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  entryPoints: [path.join(root, 'src/ui/image-card-client.ts')],
  bundle: true, write: false, platform: 'browser', format: 'iife',
  target: ['chrome110'], minify: true, legalComments: 'inline',
});
const template = await readFile(path.join(root, 'src/ui/index.html'), 'utf8');
if (!template.includes('<!-- APP_SCRIPT -->')) throw new Error('Missing UI script placeholder');
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = template.replace('<!-- APP_SCRIPT -->', () => `<script>${script}</script>`);
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (inlineScripts.length !== 1 || inlineScripts[0][1] !== script) {
  throw new Error('Bundled script changed during HTML insertion');
}
new Script(inlineScripts[0][1], { filename: 'image-card-bundle.js' });
await mkdir(path.join(root, 'dist/ui'), { recursive: true });
await writeFile(path.join(root, 'dist/ui/image-card.html'), html);
process.stderr.write('Built self-contained MCP App image card.\n');
