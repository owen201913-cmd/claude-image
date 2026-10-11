import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Optional browser smoke: ordinary CI stays offline without requiring an installed Edge.
// Build the card first, then set NGINI_CSP_BROWSER_TEST=1 to exercise strict host CSP.
const enabled = process.env.NGINI_CSP_BROWSER_TEST === '1';
async function removeTestProfile(profileDir: string, expectedPrefix: string): Promise<void> {
  const temporaryRoot = await realpath(tmpdir());
  const resolved = await realpath(profileDir);
  if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith(expectedPrefix)) {
    throw new Error('Refusing to remove a profile outside the explicit test temporary directory');
  }
  await rm(resolved, { recursive: true, force: true });
}
describe.skipIf(!enabled)('built MCP App card under strict CSP', () => {
  it('initializes, displays the labeled fixture, and emits no dynamic-eval violation', async () => {
    const profileDir = await mkdtemp(path.join(tmpdir(), 'ngini-card-csp-'));
    try {
      // The standalone JS helper also writes comparable before/after diagnostic reports.
      const helperPath = path.resolve('scripts/card-csp-smoke.mjs');
      const { runCardCspSmoke } = await import(/* @vite-ignore */ pathToFileURL(helperPath).href);
      const report = await runCardCspSmoke({ profileDir, label: 'integration-test',
        fixtureMessage: 'DELIVERY_BLOCKED：圖片已保存，但 host 無法提供預覽或原圖下載。' });
      expect(report.live_submissions).toBe(0);
      expect(report.initialized).toBe(true);
      expect(report.previewVisible).toBe(true);
      expect(report.previewWidth).toBe(48);
      expect(report.preview_status).not.toContain('DELIVERY_BLOCKED');
      expect(report.preview_status).toContain('保存結果尚待驗證');
      expect(report.fixtureLabelVisible).toBe(true);
      expect(report.imageOnlyReady).toBe(true);
      expect(report.pictureIsDownloadAction).toBe(true);
      expect(report.originalDownloadAccessibleLabel).toBe('下載原圖');
      expect(report.previewRenderedHeight).toBeLessThanOrEqual(460);
      expect(report.delivery_reports).toContain('preview_visible');
      expect(report.delivery_reports).toContain('download_accepted');
      expect(report.synthetic_download_matches_original).toBe(true);
      expect(report.synthetic_download_count).toBe(1);
      expect(report.synthetic_download_sha256).toBe(report.original_sha256);
      expect(report.real_host_saved_original).toBe(false);
      expect(report.cspEvents).toEqual([]);
      expect(report.page_errors).toEqual([]);
      expect(report.aborted_urls).toEqual([]);
    } finally {
      await removeTestProfile(profileDir, 'ngini-card-csp-');
    }
  }, 20_000);

  it('shows only a keyboard-downloadable picture for the synthetic normal-source presentation branch', async () => {
    const profileDir = await mkdtemp(path.join(tmpdir(), 'ngini-card-picture-only-'));
    try {
      const helperPath = path.resolve('scripts/card-csp-smoke.mjs');
      const { runCardCspSmoke } = await import(/* @vite-ignore */ pathToFileURL(helperPath).href);
      // This marker exercises the normal presentation branch only; the generated pixels are a local fixture.
      const report = await runCardCspSmoke({ profileDir, label: 'synthetic-normal-presentation',
        syntheticSource: 'ngini', downloadViaKeyboard: true });
      expect(report.synthetic_image_never_generated_by_ngini).toBe(true);
      expect(report.live_submissions).toBe(0);
      expect(report.imageOnlyReady).toBe(true);
      expect(report.fixtureLabelVisible).toBe(false);
      expect(report.pictureIsDownloadAction).toBe(true);
      expect(report.originalDownloadAccessibleLabel).toBe('下載原圖');
      expect(report.synthetic_download_matches_original).toBe(true);
      expect(report.cspEvents).toEqual([]);
      expect(report.page_errors).toEqual([]);
      expect(report.aborted_urls).toEqual([]);
    } finally {
      await removeTestProfile(profileDir, 'ngini-card-picture-only-');
    }
  }, 20_000);

  it('grows an initially zero-height iframe when the host applies size notifications', async () => {
    const profileDir = await mkdtemp(path.join(tmpdir(), 'ngini-card-zero-height-'));
    try {
      const helperPath = path.resolve('scripts/card-csp-smoke.mjs');
      const { runCardCspSmoke } = await import(/* @vite-ignore */ pathToFileURL(helperPath).href);
      const report = await runCardCspSmoke({ profileDir, label: 'zero-height-integration-test',
        initialHeight: 0, applySizeNotifications: true, reportPath: '.runtime/card-zero-height.json',
        fixtureMessage: '前次圖片卡片回報交付問題；原圖已保存，可重取同一張圖片，不會重新生成。原檔下載尚未獨立驗證。' });
      expect(report.initial_iframe_height).toBe(0);
      expect(report.final_iframe_height).toBeGreaterThan(0);
      expect(report.resize_messages.length).toBeGreaterThan(0);
      expect(report.resize_messages.every((message: { after_initialized: boolean }) => message.after_initialized)).toBe(true);
      expect(report.initialized).toBe(true);
      expect(report.previewVisible).toBe(true);
      expect(report.preview_status).not.toContain('前次圖片卡片回報交付問題');
      expect(report.synthetic_download_matches_original).toBe(true);
      expect(report.cspEvents).toEqual([]);
      expect(report.page_errors).toEqual([]);
      expect(report.live_submissions).toBe(0);
    } finally {
      await removeTestProfile(profileDir, 'ngini-card-zero-height-');
    }
  }, 20_000);
});
