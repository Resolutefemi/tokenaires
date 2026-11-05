export const ZCODE_SECRET = 'TOP_SECRET_PROMPT_TEXT';
export const ZCODE_CWD = '/Users/someone/secret-project';

function assistant(id: string, requestId: string | null, output: number, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    cwd: ZCODE_CWD,
    gitBranch: 'feature/secret-branch',
    sessionId: 'zcode-session-one',
    timestamp: '2026-10-01T10:00:00.000Z',
    ...(requestId ? { requestId } : {}),
    message: {
      id,
      model: 'glm-5.3',
      role: 'assistant',
      content: [{ type: 'text', text: ZCODE_SECRET }],
      usage: {
        input_tokens: 10,
        output_tokens: output,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 200,
        output_tokens_details: { thinking_tokens: 20 },
      },
    },
    ...extra,
  });
}

export const zcodeMainSession = [
  JSON.stringify({ type: 'user', cwd: ZCODE_CWD, message: { role: 'user', content: ZCODE_SECRET } }),
  assistant('msg_011ZZAAAAAAAAAAAAAAAAAAAA', 'req_011ZZAAAAAAAAAAAAAAAAAAAA', 5),
  assistant('msg_011ZZAAAAAAAAAAAAAAAAAAAA', 'req_011ZZAAAAAAAAAAAAAAAAAAAA', 50),
  assistant('msg_011ZZAAAAAAAAAAAAAAAAAAAA', 'req_011ZZAAAAAAAAAAAAAAAAAAAA', 12),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-10-01T10:01:00.000Z',
    message: { id: 'msg_synthetic_000000', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } },
  }),
  '{"type":"assistant","message":{"usage": broken',
  '',
  assistant('msg_011ZZBBBBBBBBBBBBBBBBBBBB', null, 7, { timestamp: '2026-10-02T08:30:00.000Z' }),
];

export const zcodeSubagentSession = [
  assistant('msg_011ZZAAAAAAAAAAAAAAAAAAAA', 'req_011ZZAAAAAAAAAAAAAAAAAAAA', 50),
  assistant('msg_011ZZCCCCCCCCCCCCCCCCCCCC', 'req_011ZZCCCCCCCCCCCCCCCCCCCC', 30, { timestamp: '2026-10-03T12:00:00.000Z' }),
];
