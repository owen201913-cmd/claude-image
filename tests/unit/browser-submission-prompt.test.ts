import { describe, expect, it } from 'vitest';
import { buildSubmissionPrompt } from '../../src/browser/submission-prompt.js';

describe('unchanged scene description submission (offline)', () => {
  it.each([
    '橘貓在太空船窗邊睡覺，溫暖插畫風，無文字',
    '  Two adults: blue and yellow clothes. Keep the exact text "Hello".\r\nNo extra people.  ',
    'حافظ على النص العربي: مرحبا، قطة نائمة، بدون أشخاص',
    '窓辺の猫 🐈\n日本語「おやすみ」をそのまま入れてください。',
  ])('preserves every original character with no appended control instruction: %j', body => {
    expect(buildSubmissionPrompt(body)).toBe(body);
  });

  it('does not hard-truncate or normalize a long description', () => {
    const body = '保留人物、衣服、色彩、姿勢與指定文字。 '.repeat(1500) + '\r\n保留結尾條件與空格。  ';
    expect(buildSubmissionPrompt(body)).toBe(body);
  });
});
