import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UsageRecord } from '@tokenaires/contracts';
import { parseZcodeFile } from '@/parsers/zcode';
import { zcodeRoots } from '@/parsers/paths';
import { scanLocal } from '@/scan';
import { zcodeMainSession, zcodeSubagentSession } from './fixtures/zcode';
import { makeTempDir, removeDir, writeLines } from './helpers/temp';

describe('ZCode parser', () => {
  let root = '';
  beforeEach(async () => {
    root = await makeTempDir('zcode');
  });
  afterEach(async () => {
    await removeDir(root);
  });

  it('maps usage fields and builds the record id from message and request ids', async () => {
    const path = `${root}/session.jsonl`;
    await writeLines(path, zcodeMainSession);
    const records = (await parseZcodeFile(path)) ?? [];
    const into = new Map<string, UsageRecord>(records.map((record) => [record.recordId, record]));
    expect(into.size).toBe(2);
    expect(into.get('msg_011ZZAAAAAAAAAAAAAAAAAAAA:req_011ZZAAAAAAAAAAAAAAAAAAAA')).toEqual({
      source: 'zcode',
      recordId: 'msg_011ZZAAAAAAAAAAAAAAAAAAAA:req_011ZZAAAAAAAAAAAAAAAAAAAA',
      model: 'glm-5.3',
      occurredAt: '2026-10-01T10:00:00.000Z',
      inputTokens: 10,
      outputTokens: 50,
      cacheReadTokens: 1000,
      cacheWriteTokens: 200,
      reasoningTokens: 20,
    });
    expect(into.get('msg_011ZZBBBBBBBBBBBBBBBBBBBB')?.outputTokens).toBe(7);
  });

  it('skips user lines, synthetic models, blank and malformed lines', async () => {
    const path = `${root}/session.jsonl`;
    await writeLines(path, zcodeMainSession);
    const records = (await parseZcodeFile(path)) ?? [];
    expect(records.some((record) => record.model === '<synthetic>')).toBe(false);
    expect(JSON.stringify(records)).not.toContain('TOP_SECRET_PROMPT_TEXT');
    expect(JSON.stringify(records)).not.toContain('secret-project');
  });

  it('walks nested subagent folders and dedupes across files', async () => {
    const config = `${root}/zcode-config`;
    const project = `${config}/projects/-Users-someone-secret-project`;
    await writeLines(`${project}/session-one.jsonl`, zcodeMainSession);
    await writeLines(`${project}/session-one/subagents/agent-1.jsonl`, zcodeSubagentSession);
    const result = await scanLocal({ env: { ZCODE_CONFIG_DIR: config }, home: root, cachePath: null });
    const zcode = result.records.filter((record) => record.source === 'zcode');
    expect(result.files['zcode']).toBe(2);
    expect(zcode.map((record) => record.recordId).sort()).toEqual([
      'msg_011ZZAAAAAAAAAAAAAAAAAAAA:req_011ZZAAAAAAAAAAAAAAAAAAAA',
      'msg_011ZZBBBBBBBBBBBBBBBBBBBB',
      'msg_011ZZCCCCCCCCCCCCCCCCCCCC:req_011ZZCCCCCCCCCCCCCCCCCCCC',
    ]);
  });

  it('reads both default locations unless ZCODE_CONFIG_DIR is set', () => {
    expect(zcodeRoots({}, '/home/me')).toEqual(['/home/me/.zcode/projects', '/home/me/.config/zcode/projects']);
    expect(zcodeRoots({ ZCODE_CONFIG_DIR: '/a, /b' }, '/home/me')).toEqual(['/a/projects', '/b/projects']);
    expect(zcodeRoots({ ZCODE_CONFIG_DIR: '~/one,~/two' }, '/home/me')).toEqual(['/home/me/one/projects', '/home/me/two/projects']);
    expect(zcodeRoots({ XDG_CONFIG_HOME: '/xdg' }, '/home/me')).toContain('/xdg/zcode/projects');
  });
});
