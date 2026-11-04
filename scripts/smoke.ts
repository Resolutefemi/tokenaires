import { createHash, generateKeyPairSync, KeyObject, sign } from 'node:crypto';
import { customAlphabet } from 'nanoid';
import {
  BoardResponse,
  DevicePollResponse,
  DeviceStartResponse,
  IngestResult,
  MeSummary,
  ProfileResponse,
  SIGNATURE_HEADERS,
  UsageRecord,
} from '@tokenaires/contracts';

const API = process.env.SMOKE_API_URL ?? 'http://localhost:7020/api/v1';
const alnum = customAlphabet(
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789',
  24,
);
const hex = customAlphabet('0123456789abcdef', 12);
const run = hex().slice(0, 6);

interface Session {
  handle: string;
  token: string;
  deviceId: string;
  privateKey: KeyObject;
}

function check(condition: boolean, label: string): void {
  if (!condition) throw new Error(`FAILED: ${label}`);
  process.stdout.write(`ok  ${label}\n`);
}

async function json<T>(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${API}${path}`, init);
  return { status: response.status, body: (await response.json()) as T };
}

async function login(handle: string): Promise<Session> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
  const start = await json<DeviceStartResponse>('/auth/device/start', {
    method: 'POST',
  });
  const poll = (): Promise<{ status: number; body: DevicePollResponse }> =>
    json<DevicePollResponse>('/auth/device/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: start.body.sessionId,
        publicKey: spki,
        deviceName: 'smoke',
        platform: 'darwin',
      }),
    });
  check(
    (await poll()).body.status === 'pending',
    `${handle} poll is pending before approval`,
  );
  const approve = await fetch(`${start.body.verificationUri}&handle=${handle}`);
  check(approve.ok, `${handle} dev approval`);
  const done = await poll();
  if (done.body.status !== 'complete')
    throw new Error(`login failed: ${JSON.stringify(done.body)}`);
  check(
    (await poll()).body.status === 'expired',
    `${handle} session cannot be reused`,
  );
  return {
    handle,
    token: done.body.token,
    deviceId: done.body.deviceId,
    privateKey,
  };
}

function claudeRecord(minutesAgo: number, output: number): UsageRecord {
  return {
    source: 'claude-code',
    recordId: `msg_${alnum()}:req_${alnum()}`,
    model: 'claude-opus-5-5',
    occurredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    inputTokens: 12,
    outputTokens: output,
    cacheReadTokens: 40_000,
    cacheWriteTokens: 2_000,
    reasoningTokens: Math.floor(output / 4),
  };
}

async function upload(
  session: Session,
  records: UsageRecord[],
  replay?: { timestamp: string; signature: string; raw: string },
) {
  const raw = replay?.raw ?? JSON.stringify({ cliVersion: 'smoke', records });
  const timestamp = replay?.timestamp ?? String(Date.now());
  const digest = createHash('sha256').update(raw).digest('hex');
  const signature =
    replay?.signature ??
    sign(
      null,
      Buffer.from(`${timestamp}.${digest}`),
      session.privateKey,
    ).toString('base64');
  const result = await json<IngestResult>('/usage/batches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
      [SIGNATURE_HEADERS.device]: session.deviceId,
      [SIGNATURE_HEADERS.timestamp]: timestamp,
      [SIGNATURE_HEADERS.signature]: signature,
    },
    body: raw,
  });
  return { ...result, sent: { raw, timestamp, signature } };
}

async function main(): Promise<void> {
  const alice = await login(`alice-${run}`);
  const bob = await login(`bob-${run}`);
  const shared = claudeRecord(30, 900);
  const aliceRecords = [shared, claudeRecord(20, 1200), claudeRecord(10, 400)];
  const codex: UsageRecord = {
    source: 'codex',
    recordId: `01a183fb-b19e-7281-b173-${hex()}:42`,
    model: 'gpt-6.1-sol',
    occurredAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    inputTokens: 20_000,
    outputTokens: 800,
    cacheReadTokens: 13_000,
    cacheWriteTokens: 0,
    reasoningTokens: 200,
  };
  const bad = { ...claudeRecord(1, 10), recordId: 'not-a-message-id' };
  const future = { ...claudeRecord(-60 * 24, 10) };
  const first = await upload(alice, [...aliceRecords, codex, bad, future]);
  check(
    first.status === 200 && first.body.accepted === 4,
    'alice uploads four valid records',
  );
  const reasons = Object.fromEntries(
    first.body.rejected.map((entry) => [entry.reason, entry.count]),
  );
  check(
    reasons.invalid_record_id === 1 && reasons.future_timestamp === 1,
    'bad id and future record rejected',
  );

  const replay = await upload(alice, [], first.sent);
  check(replay.status === 401, 'replayed signature refused');
  const again = await upload(alice, aliceRecords);
  check(
    again.body.accepted === 0 && again.body.duplicates === 3,
    'resend counts as duplicates',
  );

  const forged = await upload(alice, aliceRecords, {
    raw: JSON.stringify({
      cliVersion: 'x',
      records: [claudeRecord(2, 99_000)],
    }),
    timestamp: String(Date.now()),
    signature: again.sent.signature,
  });
  check(forged.status === 401, 'body edited after signing refused');
  const unsigned = await json('/usage/batches', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${alice.token}`,
    },
    body: '{"cliVersion":"x","records":[]}',
  });
  check(unsigned.status === 401, 'unsigned upload refused');
  const extra = await upload(alice, [
    { ...claudeRecord(3, 5), prompt: 'secret' } as UsageRecord,
  ]);
  check(extra.status === 400, 'unknown record fields refused');

  const stolen = await upload(bob, [shared, claudeRecord(4, 300)]);
  const stolenReasons = Object.fromEntries(
    stolen.body.rejected.map((entry) => [entry.reason, entry.count]),
  );
  check(
    stolen.body.accepted === 1 && stolenReasons.claimed_by_other_user === 1,
    'record owned by alice cannot be claimed by bob',
  );
  check(stolen.body.underReview, 'bob is marked for review');

  const board = await json<BoardResponse>('/boards?period=all');
  const aliceEntry = board.body.entries.find(
    (entry) => entry.user.handle === alice.handle,
  );
  const bobEntry = board.body.entries.find(
    (entry) => entry.user.handle === bob.handle,
  );
  check(Boolean(aliceEntry), 'alice is on the board');
  check(!bobEntry, 'bob is left off the board while under review');
  check(
    aliceEntry?.tokens === 3 * 42_012 + 900 + 1200 + 400 + 33_800,
    'alice total is server computed',
  );
  const bobProfile = await json<ProfileResponse>(`/users/${bob.handle}`);
  check(
    bobProfile.body.status === 'review' && bobProfile.body.ranks.all === null,
    'bob profile shows review and no rank',
  );

  const carol = await login(`carol-${run}`);
  const hour = Math.floor(Date.now() / 3_600_000) * 3_600_000 - 2 * 3_600_000;
  const flood = Array.from({ length: 1_000 }, (_, index) => ({
    ...claudeRecord(0, 50),
    occurredAt: new Date(hour + index * 1_000).toISOString(),
    cacheReadTokens: 2_050_000,
  }));
  const firstFlood = await upload(carol, flood);
  check(
    firstFlood.body.accepted === 1_000 && !firstFlood.body.underReview,
    'two billion cached tokens in an hour is still allowed',
  );
  const secondFlood = await upload(
    carol,
    flood.map((record) => ({
      ...record,
      recordId: `msg_${alnum()}:req_${alnum()}`,
    })),
  );
  check(
    secondFlood.body.underReview,
    'over four billion tokens in one hour puts carol under review',
  );
  const afterFlood = await json<BoardResponse>('/boards?period=all');
  check(
    !afterFlood.body.entries.some(
      (entry) => entry.user.handle === carol.handle,
    ),
    'carol is left off the board',
  );
  const dave = await login(`dave-${run}`);
  const history = Array.from({ length: 8 }, (_, index) => ({
    ...claudeRecord((index + 2) * 24 * 60, 200),
    cacheReadTokens: 100_000,
  }));
  const quiet = await upload(dave, history);
  check(
    quiet.body.accepted === 8 && !quiet.body.underReview,
    'eight quiet days of history are fine',
  );
  const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  const burst = (offsetMs: number) =>
    Array.from({ length: 1_000 }, (_, index) => ({
      ...claudeRecord(0, 50),
      occurredAt: new Date(today + offsetMs + index * 1_000).toISOString(),
      cacheReadTokens: 2_050_000,
    }));
  const burstHour = Math.min(
    Date.now() - today - 3 * 3_600_000,
    20 * 3_600_000,
  );
  const firstBurst = await upload(dave, burst(Math.max(0, burstHour)));
  check(!firstBurst.body.underReview, 'two billion tokens today is still fine');
  const secondBurst = await upload(
    dave,
    burst(Math.max(0, burstHour) + 3_600_000),
  );
  check(
    secondBurst.body.underReview,
    'a day over four billion and far above the usual pace goes to review',
  );

  const codexBoard = await json<BoardResponse>(
    '/boards?period=week&source=codex',
  );
  check(
    codexBoard.body.entries.some((entry) => entry.user.handle === alice.handle),
    'codex weekly board lists alice',
  );
  check(
    (await json('/boards?period=year')).status === 400,
    'invalid period refused',
  );

  const profile = await json<ProfileResponse>(
    `/users/${alice.handle.toUpperCase()}`,
  );
  check(
    profile.status === 200 &&
      profile.body.bySource.length === 2 &&
      profile.body.streakDays >= 1,
    'profile has sources and streak',
  );
  const me = await json<MeSummary>('/me', {
    headers: { Authorization: `Bearer ${alice.token}` },
  });
  check(
    me.body.cursors.length === 2 && me.body.ranks.all !== null,
    'me returns cursors and rank',
  );
  check((await json('/me')).status === 401, 'me needs a token');
  const revoked = await json<{ revoked: boolean }>('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bob.token}` },
  });
  check(revoked.body.revoked, 'logout revokes the device');
  const afterLogout = await json('/me', {
    headers: { Authorization: `Bearer ${bob.token}` },
  });
  check(afterLogout.status === 401, 'a revoked token stops working');
  const lateUpload = await upload(bob, [claudeRecord(2, 10)]);
  check(lateUpload.status === 401, 'a revoked device cannot upload');
  check(
    (await json('/users/nobody-here-zz')).status === 404,
    'unknown profile is 404',
  );
  process.stdout.write('\nSmoke passed\n');
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
