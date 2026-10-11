// Read the installed bridge's UI through stdio without creating any image job.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw new Error('Provide the installed bridge dist/bootstrap.js');
const entry = path.resolve(process.argv[2]);
const runtime = path.join(root, '.runtime', 'resource-inspection', randomUUID());
await mkdir(runtime, { recursive: true });
const client = new Client({ name: 'installed-resource-inspection', version: '1' }, { capabilities: {} });
const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: {
  PATH: process.env.PATH || '', SystemRoot: process.env.SystemRoot || '',
  NGINI_DATA_DIR: runtime, NGINI_OUTPUT_DIR: path.join(runtime, 'outputs'),
}, stderr: 'pipe' });
try {
  await client.connect(transport);
  const resources = await client.listResources();
  const serverVersion = client.getServerVersion()?.version;
  if (typeof serverVersion !== 'string' || !serverVersion) throw new Error('Installed server version is missing');
  const uri = `ui://ngini-image-bridge/${encodeURIComponent(serverVersion)}/image-card.html`;
  const descriptor = resources.resources.find(resource => resource.uri === uri);
  if (resources.resources.some(resource => resource.uri === 'ui://ngini-image-bridge/image-card.html')) throw new Error('Unversioned cached card URI remains registered');
  const tools = await client.listTools();
  const appTools = ['ngini_generate_image', 'ngini_get_result', 'ngini_read_image', 'ngini_read_image_chunk', 'ngini_report_delivery'];
  const ordinaryTools = ['ngini_get_status', 'ngini_cancel_generation'];
  const appOnlyTools = new Set(['ngini_read_image', 'ngini_read_image_chunk', 'ngini_report_delivery']);
  const expectedNames = [...appTools, ...ordinaryTools].sort();
  if (JSON.stringify(tools.tools.map(tool => tool.name).sort()) !== JSON.stringify(expectedNames)) throw new Error('Installed normal tool inventory differs');
  for (const name of appTools) {
    const metadata = tools.tools.find(tool => tool.name === name)?._meta?.ui;
    if (metadata?.resourceUri !== uri) throw new Error('Installed tool/card resource identity differs: ' + name);
    const visibility = appOnlyTools.has(name) ? ['app'] : ['app', 'model'];
    if (!Array.isArray(metadata.visibility) || JSON.stringify([...metadata.visibility].sort()) !== JSON.stringify(visibility)) {
      throw new Error('Installed App tool visibility differs: ' + name);
    }
  }
  for (const name of ordinaryTools) {
    const metadata = tools.tools.find(tool => tool.name === name)?._meta;
    if (metadata?.ui?.resourceUri || metadata?.['ui/resourceUri']) throw new Error('Installed ordinary tool can open a duplicate card: ' + name);
  }
  const response = await client.readResource({ uri });
  const content = response.contents.find(item => item.uri === uri && 'text' in item);
  if (!descriptor || !content || content.mimeType !== 'text/html;profile=mcp-app') throw new Error('UI resource missing');
  if (!content.text.includes('ngini_read_image_chunk') || /name:\s*["']ngini_read_image["']/.test(content.text)) throw new Error('Installed served card does not use chunk reads');
  const hash = createHash('sha256').update(content.text).digest('hex');
  const tested = JSON.parse(await readFile(path.join(root, 'docs/card-csp-smoke.json'), 'utf8'));
  if (hash !== tested.html_sha256 || tested.test_status !== 'PASS') throw new Error('Installed served UI differs from tested UI');
  const report = { status: 'PASS', checked_at: new Date().toISOString(),
    scope: 'Installed bridge served UI through an isolated stdio client; NOT actual Claude iframe',
    html_sha256: hash, html_chars: content.text.length, mime: content.mimeType,
    ui_resource_uri: uri, tool_resource_metadata_consistent: true, served_chunk_client_present: true,
    app_tools: appTools.length, ordinary_tools_without_card_uri: ordinaryTools.length, app_only_visibility_verified: true,
    server_info: client.getServerVersion(), image_jobs_created: 0, live_submissions: 0 };
  await writeFile(path.join(root, 'docs/installed-resource-inspection.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await client.close(); }
