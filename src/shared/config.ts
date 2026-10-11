import { homedir } from 'node:os';
import path from 'node:path';

export const VERSION = '0.1.0';
export function getConfig() {
  const dataDir = process.env.NGINI_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(homedir(), '.local', 'share'), 'NginiImageBridge');
  return {
    dataDir,
    requestDir: path.join(dataDir, 'requests'),
    profileDir: path.join(dataDir, 'browser-profile'),
    outputDir: process.env.NGINI_OUTPUT_DIR || path.join(homedir(), 'Pictures', 'Ngini Image Bridge'),
    fixtureMode: ['1','true'].includes(process.env.NGINI_FIXTURE_MODE || ''),
    browserHeadless: !['1','true'].includes(process.env.NGINI_VISIBLE_BROWSER || ''),
    generationTimeoutMs: 180000,
    operationTimeoutMs: 30000,
    downloadTimeoutMs: 60000,
  };
}
