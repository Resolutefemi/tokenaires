import { UsageRecord } from '@tokenaires/contracts';
import {
  BucketTotals,
  evaluateRecord,
  rateBreaches,
  totalTokensOf,
} from './usage.rules';

const now = Date.parse('2026-11-03T12:00:00Z');

const base: UsageRecord = {
  source: 'claude-code',
  recordId: 'msg_011CggL7rskVGoeCVHL8FEK2:req_011CggL7r4PBNcJWqtQWZmPJ',
  model: 'claude-opus-5-5',
  occurredAt: '2026-11-03T11:00:00Z',
  inputTokens: 2,
  outputTokens: 453,
  cacheReadTokens: 27_873,
  cacheWriteTokens: 41_916,
  reasoningTokens: 87,
};

describe('evaluateRecord', () => {
  it('accepts a real looking Claude record', () => {
    expect(evaluateRecord(base, now)).toBeNull();
  });

  it('accepts a Codex record keyed by session and ordinal', () => {
    const codex: UsageRecord = {
      ...base,
      source: 'codex',
      recordId: '01a183fb-b19e-7281-b173-b202b6051a51:18',
      model: 'gpt-6.1-sol',
    };
    expect(evaluateRecord(codex, now)).toBeNull();
  });

  it.each([
    ['gemini-cli', 'session-8c1d2e:msg-0004'],
    ['antigravity', 'traj_7f3a2c91.step.12'],
    ['opencode', 'msg_01JABCDEF0123456789'],
    ['kimi-code', 'session_9681c707-224e-45a2-8870-0a1633dc0c4c:main:42'],
    ['qwen-code', '3f2a1b0c-9d8e-4f7a-b6c5-d4e3f2a1b0c9'],
    ['copilot-cli', 'copilot:7d3c1e9a5b2f4c6d8e0a1b3c5d7e9f01'],
    ['cline', '1761234567890:1761234599123'],
    ['roo-code', '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b:1761234599123'],
    ['kilo-code', 'msg_01JABCDEF0123456789'],
  ] as const)('accepts a native %s record id', (source, recordId) => {
    expect(
      evaluateRecord({ ...base, source, recordId, model: 'gemini-3-pro' }, now),
    ).toBeNull();
  });

  it('rejects malformed native ids and pre-launch Antigravity records', () => {
    const opencode = { ...base, source: 'opencode' as const, model: 'gpt-5' };
    expect(
      evaluateRecord({ ...opencode, recordId: '-starts-with-dash' }, now),
    ).toBe('invalid_record_id');
    expect(
      evaluateRecord({ ...opencode, recordId: 'has spaces in id' }, now),
    ).toBe('invalid_record_id');
    expect(
      evaluateRecord(
        {
          ...opencode,
          source: 'antigravity',
          recordId: 'traj_7f3a2c91.step.1',
          occurredAt: '2025-08-01T00:00:00Z',
        },
        now,
      ),
    ).toBe('before_source_launch');
  });

  it.each([
    [{ recordId: 'msg_short' }, 'invalid_record_id'],
    [{ source: 'codex' as const }, 'invalid_record_id'],
    [{ occurredAt: '2026-11-04T12:00:00Z' }, 'future_timestamp'],
    [{ occurredAt: '2024-12-01T00:00:00Z' }, 'before_source_launch'],
    [
      { model: 'claude-opus-4-5-20251101', occurredAt: '2025-06-01T00:00:00Z' },
      'before_model_release',
    ],
    [
      { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      'implausible_ratio',
    ],
    [{ reasoningTokens: 900 }, 'implausible_ratio'],
    [{ outputTokens: 400_000, reasoningTokens: 0 }, 'implausible_ratio'],
    [{ cacheReadTokens: 4_500_000 }, 'implausible_ratio'],
    [{ cacheReadTokens: 2_200_000 }, 'implausible_ratio'],
  ])('rejects %p as %s', (patch, reason) => {
    expect(evaluateRecord({ ...base, ...patch }, now)).toBe(reason);
  });

  it('counts reasoning inside output, not twice', () => {
    expect(totalTokensOf(base)).toBe(2 + 453 + 27_873 + 41_916);
  });

  it('accepts a full 1M context call', () => {
    expect(
      evaluateRecord(
        { ...base, cacheReadTokens: 958_621, inputTokens: 33_040 },
        now,
      ),
    ).toBeNull();
  });
});

describe('rateBreaches', () => {
  const bucket = (patch: Partial<BucketTotals>): BucketTotals => ({
    bucket: '2026-11-01 10:00:00+00',
    outputTokens: 0,
    totalTokens: 0,
    records: 0,
    ...patch,
  });

  it('leaves the heaviest real hour and day seen so far alone', () => {
    expect(
      rateBreaches('hour', [
        bucket({
          outputTokens: 2_097_850,
          totalTokens: 1_731_346_208,
          records: 4_282,
        }),
      ]),
    ).toEqual([]);
    expect(
      rateBreaches('day', [
        bucket({
          outputTokens: 9_809_159,
          totalTokens: 5_570_959_733,
          records: 13_025,
        }),
      ]),
    ).toEqual([]);
  });

  it('reviews huge cache read totals even when output stays small', () => {
    const breaches = rateBreaches('hour', [
      bucket({
        outputTokens: 1_000,
        totalTokens: 4_200_000_000,
        records: 2_000,
      }),
      bucket({ bucket: 'quiet', totalTokens: 10 }),
    ]);
    expect(breaches.map((breach) => breach.rate.metric)).toEqual([
      'totalTokens',
    ]);
    expect(breaches[0]?.bucket.totalTokens).toBe(4_200_000_000);
  });

  it('reviews call floods and output spikes per day', () => {
    const breaches = rateBreaches('day', [
      bucket({
        outputTokens: 41_000_000,
        totalTokens: 15_500_000_000,
        records: 61_000,
      }),
    ]);
    expect(breaches.map((breach) => breach.rate.metric).sort()).toEqual([
      'outputTokens',
      'records',
      'totalTokens',
    ]);
  });
});
