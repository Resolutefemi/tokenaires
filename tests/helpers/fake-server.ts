import { createHash, createPublicKey, verify } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SIGNATURE_HEADERS, SIGNATURE_MAX_SKEW_MS, type MeSummary, type UsageRecord } from '@tokenaires/contracts';

export interface FakeState {
  publicKey: string | null;
  pollBodies: Record<string, unknown>[];
  pollReplies: Record<string, unknown>[];
  uploads: { raw: string; records: Record<string, unknown>[] }[];
  badSignatures: number;
  meCalls: number;
  rateLimitOnce: boolean;
  rateLimited: number;
  rejectAuth: boolean;
  revoked: number;
  staleSignatures: number;
  cursors: MeSummary['cursors'];
}

export interface FakeServer {
  url: string;
  state: FakeState;
  close(): Promise<void>;
}

const TOKEN = 'fake-token';
const DEVICE = 'device-123';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function signatureValid(state: FakeState, req: IncomingMessage, raw: string): boolean {
  const timestamp = req.headers[SIGNATURE_HEADERS.timestamp];
  const signature = req.headers[SIGNATURE_HEADERS.signature];
  const device = req.headers[SIGNATURE_HEADERS.device];
  if (typeof timestamp !== 'string' || typeof signature !== 'string' || device !== DEVICE || !state.publicKey) return false;
  const key = createPublicKey({ key: Buffer.from(state.publicKey, 'base64'), format: 'der', type: 'spki' });
  const message = `${timestamp}.${createHash('sha256').update(raw).digest('hex')}`;
  return verify(null, Buffer.from(message), key, Buffer.from(signature, 'base64'));
}

function signatureFresh(req: IncomingMessage): boolean {
  const sentAt = Number(req.headers[SIGNATURE_HEADERS.timestamp]);
  return Number.isFinite(sentAt) && Math.abs(Date.now() - sentAt) <= SIGNATURE_MAX_SKEW_MS;
}

function me(state: FakeState): MeSummary {
  const total = state.uploads.flatMap((upload) => upload.records).length * 1000;
  return {
    user: { handle: 'ada', name: 'Ada', avatarUrl: null, country: null },
    tier: total >= 1000 ? 'thousandaire' : 'hopeful',
    status: 'ok',
    totalTokens: total,
    ranks: { all: 42, month: 7, week: null },
    cursors: state.cursors,
  };
}

async function handle(state: FakeState, base: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = await readBody(req);
  const path = (req.url ?? '').replace('/api/v1', '');
  const authorized = req.headers.authorization === `Bearer ${TOKEN}` && !state.rejectAuth;
  if (path === '/auth/device/start') {
    send(res, 200, { sessionId: 'sess-1', userCode: 'ABCD-EFGH', verificationUri: `${base}/approve?code=ABCD-EFGH`, expiresIn: 600, interval: 1 });
  } else if (path === '/auth/device/poll') {
    const body = JSON.parse(raw) as Record<string, unknown>;
    state.pollBodies.push(body);
    state.publicKey = typeof body.publicKey === 'string' ? body.publicKey : null;
    send(res, 200, state.pollReplies.shift() ?? { status: 'complete', token: TOKEN, deviceId: DEVICE, user: me(state).user });
  } else if (path === '/auth/logout') {
    if (!authorized) send(res, 401, { message: 'Unauthorized' });
    else {
      state.revoked += 1;
      state.rejectAuth = true;
      send(res, 200, { revoked: true });
    }
  } else if (path === '/me') {
    state.meCalls += 1;
    if (!authorized) send(res, 401, { message: 'Unauthorized' });
    else send(res, 200, me(state));
  } else if (path === '/usage/batches') {
    if (authorized && !signatureFresh(req)) {
      state.staleSignatures += 1;
      send(res, 401, { message: 'Upload signature has expired. Check your clock' });
      return;
    }
    if (!authorized || !signatureValid(state, req, raw)) {
      state.badSignatures += authorized ? 1 : 0;
      send(res, 401, { message: 'Bad signature' });
      return;
    }
    if (state.rateLimitOnce) {
      state.rateLimitOnce = false;
      state.rateLimited += 1;
      send(res, 429, { message: 'Too many requests' }, { 'retry-after': '3' });
      return;
    }
    const records = (JSON.parse(raw) as { records: UsageRecord[] }).records as unknown as Record<string, unknown>[];
    state.uploads.push({ raw, records });
    send(res, 200, { accepted: records.length - 1, duplicates: 1, rejected: [{ reason: 'future_timestamp', count: 0 }], acceptedTokens: 5000, underReview: false });
  } else {
    send(res, 404, { message: 'Not found' });
  }
}

export async function startFakeServer(): Promise<FakeServer> {
  const state: FakeState = {
    publicKey: null,
    pollBodies: [],
    pollReplies: [],
    uploads: [],
    badSignatures: 0,
    meCalls: 0,
    rateLimitOnce: false,
    rateLimited: 0,
    rejectAuth: false,
    revoked: 0,
    staleSignatures: 0,
    cursors: [
      { source: 'claude-code', lastOccurredAt: null },
      { source: 'codex', lastOccurredAt: null },
    ],
  };
  let base = '';
  const server: Server = createServer((req, res) => {
    void handle(state, base, req, res);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url: `${base}/api/v1`,
    state,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
}
