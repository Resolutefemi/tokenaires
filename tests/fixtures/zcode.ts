export const ZCODE_SECRET = 'TOP_SECRET_PROMPT_TEXT';
export const ZCODE_SESSION = 'sess_3e5a37f3-59d6-4b0c-b6e5-ac35d1d1865c';
export const ZCODE_REQUEST = '84a002ac-e403-40db-9fee-ee6cd1b5b53b';

export interface ModelIoOptions {
  requestId?: string;
  attempt?: number;
  turnId?: string;
  sessionId?: string;
  modelId?: string;
  fallbackModelId?: string;
  requestModel?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  reasoning?: number;
  completedAt?: string;
  withUsage?: boolean;
}

export function modelIoLine(options: ModelIoOptions): string {
  const {
    requestId,
    attempt,
    turnId = 'turn_011ZZAAAAAAAAAAAAAAAAAAAA',
    sessionId = ZCODE_SESSION,
    modelId = 'glm-5.3',
    fallbackModelId,
    requestModel = 'glm-5.3',
    input = 10,
    output = 5,
    cacheRead = 0,
    reasoning = 0,
    completedAt = '2026-10-01T10:00:00.000Z',
    withUsage = true,
  } = options;
  const usage = withUsage
    ? {
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
        cacheReadTokens: cacheRead,
        reasoningTokens: reasoning,
      }
    : undefined;
  return JSON.stringify({
    completedAt,
    durationMs: 16702,
    ...(requestId ? { requestId } : {}),
    ...(attempt ? { attempt } : {}),
    model: { modelId: fallbackModelId ?? modelId, providerId: 'd6442b83-685f-4a2d-88ed-0c205a70b77d' },
    request: { body: { model: requestModel, messages: [{ role: 'user', content: ZCODE_SECRET }] } },
    response: {
      finishReason: withUsage ? 'stop' : 'error',
      modelId,
      text: withUsage ? ZCODE_SECRET : null,
      toolCalls: [],
      ...(usage ? { usage } : {}),
    },
    sessionId,
    turnId,
    type: 'model_io',
    querySource: 'main_turn',
  });
}

export const ZCODE_NO_REQUEST_ID = `${ZCODE_SESSION}:turn_011ZZAAAAAAAAAAAAAAAAAAAA:2026-10-02T08:30:00.000Z`;
export const ZCODE_MODEL_PRIORITY = '1f3c9a55-7d21-4b0e-9c66-2a8f4d5e6b70';
export const ZCODE_OTHER_REQUEST = '2b7d4e66-8c33-4f2a-a5d1-9e0b3c4d5e6f';

// Mirrors a real ~/.zcode/cli/rollout/model-io-sess_<id>.jsonl file:
// retried requests repeat the requestId with a higher attempt number,
// failed attempts carry no usage block, and each line embeds the full
// request and response payload.
export const zcodeMainSession = [
  modelIoLine({ requestId: ZCODE_REQUEST, attempt: 1, output: 5, completedAt: '2026-10-01T10:00:00.000Z' }),
  modelIoLine({
    requestId: ZCODE_REQUEST,
    attempt: 2,
    output: 50,
    cacheRead: 1000,
    reasoning: 20,
    completedAt: '2026-10-01T10:00:05.000Z',
  }),
  modelIoLine({ requestId: 'ffffffff-0000-0000-0000-000000000000', withUsage: false }),
  modelIoLine({ requestId: 'eeeeeeee-0000-0000-0000-000000000000', input: 0, output: 0 }),
  '{"type":"model_io","response":{"usage": broken',
  '',
  JSON.stringify({ type: 'log', level: 'info', message: 'usage report written', sessionId: ZCODE_SESSION }),
  modelIoLine({ output: 7, completedAt: '2026-10-02T08:30:00.000Z' }),
  modelIoLine({
    requestId: ZCODE_MODEL_PRIORITY,
    modelId: 'glm-5.3-flash',
    fallbackModelId: 'glm-5.3',
    requestModel: 'glm-5.2',
    input: 9,
    output: 3,
    completedAt: '2026-10-03T09:15:00.000Z',
  }),
];

export const zcodeOtherSession = [
  modelIoLine({
    requestId: ZCODE_REQUEST,
    attempt: 2,
    output: 50,
    cacheRead: 1000,
    reasoning: 20,
    completedAt: '2026-10-01T10:00:05.000Z',
  }),
  modelIoLine({
    requestId: ZCODE_OTHER_REQUEST,
    turnId: 'turn_011ZZBBBBBBBBBBBBBBBBBBBB',
    input: 5,
    output: 30,
    completedAt: '2026-10-03T12:00:00.000Z',
  }),
];
