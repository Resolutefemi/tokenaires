import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UsageRecord } from '@tokenaires/contracts';
import { parseZcodeFile } from '@/parsers/zcode';
import { zcodeRoots } from '@/parsers/paths';
import { scanLocal } from '@/scan';
import { ZCODE_MODEL_PRIORITY, ZCODE_NO_REQUEST_ID, ZCODE_OTHER_REQUEST, ZCODE_REQUEST, ZCODE_SECRET, zcodeMainSession, zcodeOtherSession } from './fixtures/zcode';
import { makeTempDir, removeDir, writeLines } from './helpers/temp';

describe('ZCode parser', () => {
  let root = '';
  beforeEach(async () => {
    root = await makeTempDir('zcode');
  });
  afterEach(async () => {
    await removeDir(root);
  });

  it('parses model_io usage, folds retry attempts and prefers the response model id', async () => {
    const path = `${root}/model-io-sess_main.jsonl`;
    await writeLines(path, zcodeMainSession);
    const records = (await parseZcodeFile(path)) ?? [];
    const into = new Map<string, UsageRecord>(records.map((record) => [record.recordId, record]));
    expect(into.size).toBe(3);
    expect(into.get(ZCODE_REQUEST)).toEqual({
      source: 'zcode',
      recordId: ZCODE_REQUEST,
      model: 'glm-5.3',
      occurredAt: '2026-10-01T10:00:05.000Z',
      inputTokens: 10,
      outputTokens: 50,
      cacheReadTokens: 1000,
      cacheWriteTokens: 0,
      reasoningTokens: 20,
    });
    expect(into.get(ZCODE_NO_REQUEST_ID)?.outputTokens).toBe(7);
    expect(into.get(ZCODE_MODEL_PRIORITY)?.model).toBe('glm-5.3-flash');
  });

  it('skips failed attempts, zero usage, malformed lines and never leaks request text', async () => {
    const path = `${root}/model-io-sess_main.jsonl`;
    await writeLines(path, zcodeMainSession);
    const records = (await parseZcodeFile(path)) ?? [];
    expect(records.some((record) => record.recordId.startsWith('f') || record.recordId.startsWith('e'))).toBe(false);
    expect(JSON.stringify(records)).not.toContain('TOP_SECRET_PROMPT_TEXT');
    expect(JSON.stringify(records)).not.toContain('usage report written');
  });

  it('discovers rollout files and dedupes the same request id across overlapping roots', async () => {
    await writeLines(`${root}/.zcode/cli/rollout/model-io-sess_main.jsonl`, zcodeMainSession);
    await writeLines(`${root}/.zcode/cli/rollout/model-io-sess_other.jsonl`, zcodeOtherSession);
    await writeLines(`${root}/.config/zcode/cli/rollout/model-io-sess_main.jsonl`, zcodeMainSession);
    const result = await scanLocal({ env: {}, home: root, cachePath: null });
    const zcode = result.records.filter((record) => record.source === 'zcode');
    expect(result.files['zcode']).toBe(3);
    expect(zcode.map((record) => record.recordId).sort()).toEqual(
      [ZCODE_MODEL_PRIORITY, ZCODE_OTHER_REQUEST, ZCODE_REQUEST, ZCODE_NO_REQUEST_ID].sort(),
    );
  });

  it('reads both default locations unless ZCODE_CONFIG_DIR is set', () => {
    expect(zcodeRoots({}, '/home/me')).toEqual(['/home/me/.zcode/cli/rollout', '/home/me/.config/zcode/cli/rollout']);
    expect(zcodeRoots({ ZCODE_CONFIG_DIR: '/a, /b' }, '/home/me')).toEqual(['/a/cli/rollout', '/b/cli/rollout']);
    expect(zcodeRoots({ ZCODE_CONFIG_DIR: '~/one,~/two' }, '/home/me')).toEqual(['/home/me/one/cli/rollout', '/home/me/two/cli/rollout']);
    expect(zcodeRoots({ XDG_CONFIG_HOME: '/xdg' }, '/home/me')).toContain('/xdg/zcode/cli/rollout');
  });
});
