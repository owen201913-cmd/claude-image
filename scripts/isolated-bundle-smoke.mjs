// Offline candidate QA. No provider page is opened and no quota is consumed.
import { spawn } from 'node:child_process';
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const candidate = JSON.parse(await readFile(path.join(root, 'release/latest-candidate.json'), 'utf8'));
const location = JSON.parse(await readFile(path.join(root, '.runtime', `candidate-location-${candidate.version}.json`), 'utf8'));
assert.equal(location.candidate_sha256, candidate.sha256);
const { bundle, base } = location;
const argumentsList = process.argv.slice(2);
assert.ok(argumentsList.every(arg => arg === '--browser-only' || arg === '--protocol-only' || arg === '--dns-block' || /^--report=.+/.test(arg) || /^--cold-starts=[1-3]$/.test(arg)), 'Unknown smoke argument');
const browserOnly = argumentsList.includes('--browser-only');
const protocolOnly = argumentsList.includes('--protocol-only');
assert.ok(!(browserOnly && protocolOnly), '--browser-only and --protocol-only are mutually exclusive');
const dnsBlocked = argumentsList.includes('--dns-block');
assert.ok(!protocolOnly || (!dnsBlocked && !argumentsList.some(arg => arg.startsWith('--cold-starts='))), 'Browser options are not applicable to --protocol-only');
const coldStarts = Number(argumentsList.find(arg => arg.startsWith('--cold-starts='))?.split('=')[1] ?? 3);
const reportArgument = argumentsList.find(arg => arg.startsWith('--report='))?.slice('--report='.length);
const reportPath = path.resolve(root, reportArgument ?? path.join('docs', `isolated-bundle-smoke-${candidate.version}.json`));
const reportRelative = path.relative(root, reportPath);
assert.ok(!reportRelative.startsWith('..') && !path.isAbsolute(reportRelative)
  && /^(?:docs|\.runtime)[\\/]/.test(reportRelative), 'Keep reports inside docs or .runtime');
assert.ok(!existsSync(reportPath), 'Existing evidence must not be overwritten; select a new --report path');
const relativeBundle = path.relative(root, bundle);
assert.ok(relativeBundle === '..' || relativeBundle.startsWith('..' + path.sep) || path.isAbsolute(relativeBundle), 'Use verify-candidate.py --outside-tree first');
const runId = randomUUID();
const browserOperationTimeoutMs = 30_000; // BrowserSession's actual default; do not override its constructor.
const browserDeadlineMs = coldStarts * (2 * browserOperationTimeoutMs + 30_000 + 10_000) + 10_000;
assert.ok(process.env.SystemRoot && path.isAbsolute(process.env.SystemRoot), 'An absolute Windows SystemRoot is required');
const system32 = path.join(process.env.SystemRoot, 'System32');
const taskkill = path.join(system32, 'taskkill.exe');
if (!protocolOnly) assert.ok(existsSync(taskkill), 'The Windows process-tree cleanup helper must exist');
const trace = path.join(base, `module-resolution-${runId}.jsonl`);
const guard = path.join(base, `guard-${runId}.cjs`);
await writeFile(guard, `
const {registerHooks}=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const {fileURLToPath}=require('node:url');
const root=path.resolve(process.env.NGINI_AUDIT_BUNDLE);
registerHooks({resolve(specifier,context,nextResolve){
 const resolved=nextResolve(specifier,context);
 if(resolved.url.startsWith('file:')){
  const rel=path.relative(root,path.resolve(fileURLToPath(resolved.url)));
  if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('AUDIT_EXTERNAL_MODULE_DENIED');
  fs.appendFileSync(process.env.NGINI_AUDIT_TRACE,JSON.stringify({file:rel.replaceAll('\\\\','/')})+'\\n');
 }
 return resolved;
}});
`);
const env = {
  SystemRoot: process.env.SystemRoot, SystemDrive: process.env.SystemDrive, WINDIR: process.env.WINDIR ?? process.env.SystemRoot,
  PATH: '', NODE_PATH: '', USERPROFILE: path.join(base, 'home'), HOME: path.join(base, 'home'),
  APPDATA: path.join(base, 'roaming'), LOCALAPPDATA: path.join(base, 'local'), TEMP: path.join(base, 'tmp'), TMP: path.join(base, 'tmp'),
  PROGRAMFILES: process.env.PROGRAMFILES, 'PROGRAMFILES(X86)': process.env['PROGRAMFILES(X86)'],
  NGINI_DATA_DIR: path.join(base, 'data'), NGINI_OUTPUT_DIR: path.join(base, 'outputs'),
  NGINI_AUDIT_BUNDLE: bundle, NGINI_AUDIT_TRACE: trace,
  NODE_OPTIONS: '--require=' + JSON.stringify(guard), NGINI_VISIBLE_BROWSER: 'false',
};
for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
for (const key of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'NGINI_DATA_DIR', 'NGINI_OUTPUT_DIR']) await mkdir(env[key], { recursive: true });
// Playwright's Windows shutdown invokes taskkill through cmd.exe. Keep the MCP
// dependency checks at empty PATH, but make that OS helper reachable only for
// the browser child; no Node/npm/developer bin directory is added.
const browserEnv = { ...env, PATH: system32, DEBUG: 'pw:browser' };

async function terminateOwnedChildTree(child) {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || child.exitCode !== null || child.signalCode !== null) {
    return { action: 'no_termination', reason: 'owned_child_already_exited_or_no_pid' };
  }
  return new Promise(resolve => {
    // The PID comes only from this exact spawn object, while it is still live.
    // Never enumerate or terminate browser processes by name or profile guess.
    const cleanup = spawn(taskkill, ['/pid', String(child.pid), '/T', '/F'], {
      cwd: bundle, env: browserEnv, windowsHide: true, stdio: 'ignore', shell: false,
    });
    let done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => {
      // This helper is also our own spawned process; do not leave it waiting.
      cleanup.kill();
      finish({ action: 'owned_tree_taskkill', status: 'TIMEOUT' });
    }, 5000);
    cleanup.once('error', () => finish({ action: 'owned_tree_taskkill', status: 'SPAWN_FAILED' }));
    cleanup.once('close', code => finish({ action: 'owned_tree_taskkill', status: code === 0 ? 'PASS' : 'FAIL', exit_code: code }));
  });
}

class Wire {
  constructor(fixture) {
    this.child = spawn(process.execPath, [path.join(bundle, 'dist/bootstrap.js')], {
      cwd: bundle, env: { ...env, NGINI_FIXTURE_MODE: fixture ? '1' : 'false' }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.pending = new Map(); this.id = 0; this.buffer = '';
    this.closed = new Promise(resolve => this.child.once('close', code => { this.exitCode = code; resolve(code); }));
    this.child.stderr.resume(); // Never persist raw third-party errors or machine paths.
    const fail = error => { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); } this.pending.clear(); };
    this.child.on('error', () => fail(new Error('Owned MCP process failed')));
    this.child.on('close', () => fail(new Error('Owned MCP process ended')));
    this.child.stdout.on('data', chunk => {
      this.buffer += chunk.toString(); let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
        if (!line.trim()) continue;
        let value; try { value = JSON.parse(line); } catch { fail(new Error('Non-JSON stdout')); continue; }
        if (value.id !== undefined && this.pending.has(value.id)) {
          const item = this.pending.get(value.id); this.pending.delete(value.id); clearTimeout(item.timer);
          value.error ? item.reject(new Error('MCP returned an error')) : item.resolve(value.result);
        }
      }
    });
  }
  call(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('MCP call timed out')); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async initialize() {
    const value = await this.call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'isolated-offline-bundle-smoke', version: '1.0.0' } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    assert.equal(value.serverInfo.version, location.version);
  }
  tool(name, args) { return this.call('tools/call', { name, arguments: args }); }
  async close() {
    this.child.stdin.end();
    let timer;
    try {
      const code = await Promise.race([this.closed, new Promise((_, reject) => { timer = setTimeout(() => { this.child.kill(); reject(new Error('Owned server shutdown timed out')); }, 5000); })]);
      assert.equal(code, 0);
    } finally { clearTimeout(timer); }
  }
}

const report = {
  status: 'NOT_RUN', version: location.version, candidate_sha256: location.candidate_sha256,
  started_at: new Date().toISOString(), checks: [], archive_files: location.files,
  node: process.version, node_arch: process.arch, protocol_child_PATH_empty: true, child_NODE_PATH_empty: true,
  child_user_data_isolated: true, ancestor_node_modules: location.ancestor_node_modules, real_ngini_submissions: 0,
  scope: 'Same OS, outside-development-tree MCPB and package-only Node module resolution. No Claude UI, HTTPS download or clean Windows acceptance.',
  clean_windows: 'BLOCKED_NOT_WAIVED', github_https_download: 'NOT_RUN', real_claude_delivery: 'NOT_RUN',
  browser_only: browserOnly, protocol_only: protocolOnly, browser_sample_target: protocolOnly ? 0 : coldStarts,
  browser_DNS_blocked: protocolOnly ? null : dnsBlocked, browser_service_workers_blocked: protocolOnly ? null : dnsBlocked,
  browser_child_PATH_policy: protocolOnly ? 'NOT_RUN' : 'SystemRoot_System32_only', browser_operation_timeout_ms: protocolOnly ? null : browserOperationTimeoutMs,
  browser_debug_log_scope: protocolOnly ? 'NOT_RUN' : 'pw_browser_private_bounded',
  browser_parent_deadline_ms: protocolOnly ? null : browserDeadlineMs,
  browser_launch_conditions: protocolOnly ? 'NOT_RUN_protocol_only' : dnsBlocked ? 'instrumented_network_block_and_System32_PATH' : 'production_BrowserSession_defaults_with_System32_PATH', harness_run_id: runId,
  ...(protocolOnly ? { local_browser: { status: 'NOT_RUN', reason: 'Protocol-only verification requested; unchanged browser runtime is not retested.', ngini_contact: false } } : {}),
};
let reportWrites = Promise.resolve();
const persistReport = () => {
  const snapshot = JSON.stringify(report, null, 2) + '\n';
  reportWrites = reportWrites.then(() => writeFile(reportPath, snapshot));
  return reportWrites;
};
const checkpoint = async (name, details = {}) => {
  report.checks.push({ name, status: 'PASS', ...details });
  await persistReport();
};
let stage = 'normal_protocol';
try {
  if (!browserOnly) {
  let client = new Wire(false);
  try {
    await client.initialize();
    const tools = (await client.call('tools/list', {})).tools;
    const manifest = JSON.parse(await readFile(path.join(bundle, 'manifest.json'), 'utf8'));
    assert.equal(tools.length, 7);
    assert.deepEqual(tools.map(tool => tool.name).sort(), manifest.tools.map(tool => tool.name).sort());
    assert.ok(!tools.some(tool => tool.name === 'ngini_delivery_probe'));
    const resources = (await client.call('resources/list', {})).resources;
    assert.equal(resources.length, 1);
    const card = await client.call('resources/read', { uri: resources[0].uri });
    const html = card.contents.find(item => item.mimeType === 'text/html;profile=mcp-app')?.text;
    assert.equal(createHash('sha256').update(html).digest('hex'), createHash('sha256').update(await readFile(path.join(bundle, 'dist/ui/image-card.html'))).digest('hex'));
    await checkpoint(stage, { tools: tools.length, exact_packaged_app_html: true });
  } finally { await client.close(); }
  stage = 'fixture_original_and_deduplication';
  const requestId = 'bundle-smoke-' + randomUUID(); const prompt = 'LOCAL AUDIT FIXTURE - NOT NGINI'; let image;
  client = new Wire(true);
  try {
    await client.initialize(); assert.equal((await client.call('tools/list', {})).tools.length, 8);
    const generated = await client.tool('ngini_generate_image', { prompt, request_id: requestId });
    assert.ok(!generated.isError); image = generated.structuredContent.image;
    assert.equal(image.source, 'fixture'); assert.ok(generated.content.some(item => item.type === 'image'));
    const chunk = (await client.tool('ngini_read_image_chunk', { image_id: image.image_id, offset: 0 })).structuredContent;
    assert.equal(chunk.next_offset, null);
    assert.equal(createHash('sha256').update(Buffer.from(chunk.data, 'base64')).digest('hex'), image.sha256);
    const duplicate = await client.tool('ngini_generate_image', { prompt, request_id: requestId });
    assert.equal(duplicate.structuredContent.image.image_id, image.image_id);
    await checkpoint(stage, { tools: 8, bytes: image.bytes, sha256: image.sha256 });
  } finally { await client.close(); }
  stage = 'restart_existing_result';
  client = new Wire(true);
  try {
    await client.initialize(); const reopened = await client.tool('ngini_get_result', { request_id: requestId });
    assert.equal(reopened.structuredContent.image.image_id, image.image_id);
    assert.notEqual(reopened.structuredContent.status, 'delivered');
    await checkpoint(stage, { same_image: true, did_not_claim_delivery: true });
  } finally { await client.close(); }
  }
  if (!protocolOnly) {
  stage = coldStarts === 3 ? 'three_local_browser_cold_starts' : 'local_browser_cold_starts';
  const browserModule = pathToFileURL(path.join(bundle, 'dist/browser/session.js')).href;
  const browserProgram = `const started=Date.now();
const emit=(type,value={})=>console.log(JSON.stringify({type,elapsed_ms:Date.now()-started,...value}));
emit('progress',{phase:'import_bundle'});
const {BrowserSession}=await import(${JSON.stringify(browserModule)});
${dnsBlocked ? `
const {chromium}=await import('playwright-core');
const actualLaunch=chromium.launchPersistentContext.bind(chromium);
chromium.launchPersistentContext=(profile,options)=>actualLaunch(profile,{...options,serviceWorkers:'block',args:['--host-resolver-rules=MAP * ~NOTFOUND']});
` : ''}
const results=[];
const safeCodes=new Set(['BROWSER_UNAVAILABLE','BUSY','CANCELLED','STORAGE_ERROR']);
const errorCode=error=>safeCodes.has(error?.code)?error.code:'LOCAL_BROWSER_CHECK_FAILED';
let failed=false;
emit('started');
for(let index=0;index<${coldStarts};index++){
 const s=new BrowserSession({dataDir:${JSON.stringify(base)}+'/local-browser-${runId}-'+index,headless:true});
 let phase='acquire_page',sample={attempt:index,status:'RUNNING'};
 const progress=()=>emit('progress',{attempt:index,phase,diagnostics:s.launchDiagnostics});
 const heartbeat=setInterval(progress,2000);heartbeat.unref();progress();
 try{
  const p=await s.page();phase='route';progress();
  await p.context().route('**/*',route=>route.abort());phase='navigate_data_url';progress();
  await p.goto('data:text/html,<title>LOCAL INSTALL AUDIT</title>');phase='verify_title';progress();
  if(await p.title()!=='LOCAL INSTALL AUDIT')throw new Error('Local page mismatch');
  sample={attempt:index,status:'PASS',...s.versionInfo,diagnostics:s.launchDiagnostics};
 }catch(error){failed=true;sample={attempt:index,status:'FAIL',phase,error:{code:errorCode(error)},diagnostics:s.launchDiagnostics};emit('attempt_failure',sample);}
 finally{
  phase='cleanup';progress();
  try{await s.close();phase='cleanup_complete';progress();}
  catch(error){failed=true;sample={...sample,status:'FAIL',cleanup_error:{code:errorCode(error)},diagnostics:s.launchDiagnostics};emit('attempt_failure',sample);}
  clearInterval(heartbeat);
  const resourceTypes=process.getActiveResourcesInfo();
  const resourceCounts={};
  for(const type of resourceTypes){if(/^[A-Za-z0-9_]{1,64}$/.test(type))resourceCounts[type]=(resourceCounts[type]??0)+1;}
  emit('cleanup_resources',{attempt:index,active_resource_total:resourceTypes.length,active_resource_types:Object.entries(resourceCounts).slice(0,32).map(([type,count])=>({type,count}))});
 }
 results.push(sample);emit('attempt_result',sample);
 if(failed)break;
}
emit('result',{status:failed?'FAIL':'PASS',results,ngini_contact:false});
process.exitCode=failed?1:0;`;
  report.local_browser = { status: 'RUNNING', events: [], results: [], ngini_contact: false };
  const stderrPath = path.join(root, '.runtime', `isolated-browser-stderr-${candidate.version}-${runId}.log`);
  await mkdir(path.dirname(stderrPath), { recursive: true });
  await writeFile(stderrPath, '', { flag: 'wx' });
  const stderrLimit = 64 * 1024;
  let stderrBytes = 0, stderrWrites = Promise.resolve();
  report.local_browser.stderr_capture = { private: true, limit_bytes: stderrLimit, retained_bytes: 0, truncated: false };
  await persistReport();
  const browser = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', browserProgram], { cwd: bundle, env: browserEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', settled = false, finalResult;
    // Raw third-party diagnostics may contain the private temporary profile.
    // Retain only a bounded local .runtime file; never put raw text or its path
    // into the public evidence report/source export.
    child.stderr.on('data', chunk => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const retained = bytes.subarray(0, Math.max(0, stderrLimit - stderrBytes));
      stderrBytes += retained.length;
      report.local_browser.stderr_capture.retained_bytes = stderrBytes;
      if (retained.length < bytes.length) report.local_browser.stderr_capture.truncated = true;
      if (retained.length) stderrWrites = stderrWrites.then(() => appendFile(stderrPath, retained));
    });
    child.once('exit', (code, signal) => {
      report.local_browser.process_exit = { code, signal, at: new Date().toISOString() };
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      report.local_browser.status = 'TIMEOUT';
      report.local_browser.timeout_ms = browserDeadlineMs;
      report.local_browser.failure_category = finalResult ? 'child_exit_timeout' : 'operation_timeout';
      report.local_browser.last_progress = report.local_browser.events.at(-1) ?? null;
      void (async () => {
        report.local_browser.timeout_cleanup = await terminateOwnedChildTree(child);
        // If the child exited while a descendant retained its output pipe, close
        // only these owned reader streams. Do not mask the timeout as a pass.
        child.stdout.destroy(); child.stderr.destroy();
        await stderrWrites;
        reject(new Error('Owned local browser diagnostic timed out'));
      })().catch(() => reject(new Error('Owned local browser diagnostic cleanup failed')));
    }, browserDeadlineMs);
    child.stdout.on('data', chunk => {
      if (settled) return;
      stdout += chunk.toString();
      let newline;
      while ((newline = stdout.indexOf('\n')) >= 0) {
        const line = stdout.slice(0, newline); stdout = stdout.slice(newline + 1);
        if (!line.trim()) continue;
        let value;
        try { value = JSON.parse(line); } catch {
          report.local_browser.failure_category = 'invalid_child_output';
          continue;
        }
        report.local_browser.events.push(value);
        if (report.local_browser.events.length > 128) report.local_browser.events.splice(0, report.local_browser.events.length - 128);
        if (value.type === 'result') { finalResult = value; report.local_browser.results = value.results; }
        if (value.type === 'attempt_result') report.local_browser.results = [...report.local_browser.results, value];
        void persistReport().catch(async () => {
          report.local_browser.failure_category = 'evidence_write_failed';
          await terminateOwnedChildTree(child);
        });
      }
    });
    child.on('error', () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      report.local_browser.status = 'FAIL'; report.local_browser.failure_category = 'child_spawn_failed';
      void stderrWrites.then(() => reject(new Error('Local browser process failed')), () => reject(new Error('Private diagnostic write failed')));
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      report.local_browser.exit_code = code;
      report.local_browser.status = code === 0 && finalResult?.status === 'PASS'
        && report.local_browser.failure_category === undefined ? 'PASS' : 'FAIL';
      if (!finalResult) report.local_browser.failure_category ??= 'child_ended_without_result';
      void stderrWrites.then(() => {
        report.local_browser.status === 'PASS' ? resolve(finalResult) : reject(new Error('Local browser diagnostic failed'));
      }, () => reject(new Error('Private diagnostic write failed')));
    });
  });
  await checkpoint(stage, { samples: browser.results.length });
  }
  const modules = (await readFile(trace, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line).file);
  report.distinct_package_module_files = new Set(modules).size;
  report.outside_package_module_resolutions = 0;
  report.status = 'PASS';
} catch {
  report.status = 'FAIL'; report.failed_stage = stage;
  process.exitCode = 1;
} finally {
  report.completed_at = new Date().toISOString();
  await persistReport();
  console.log(JSON.stringify(report));
}
