import type { UsageRecord } from '@tokenaires/contracts';
import { eachLine } from '@/files/lines';
import { bytesHave, child, count, isoTime, markerBuffers, nativeId, parseObject, text, type JsonObject } from '@/parsers/json';
import { hasTokens } from '@/parsers/merge';

const MARKERS = markerBuffers('"usage"');

// ZCode writes one JSONL file per session at <config>/cli/rollout/
// model-io-sess_<id>.jsonl. Every line is one model API call of type
// "model_io" carrying the full request and response, with the token
// usage under response.usage (inputTokens, outputTokens,
// cacheReadTokens, reasoningTokens). A retried request is logged again
// with the same requestId and a higher attempt number, and the file is
// append-ordered, so the last line seen for a request id is the final
// attempt. Nothing from the request/response payload (prompts, answers,
// tool output) is read into the record.
function modelOf(entry: JsonObject): string | null {
  return (
    text(child(entry, 'response'), 'modelId') ??
    text(child(entry, 'model'), 'modelId') ??
    text(child(child(entry, 'request'), 'body'), 'model')
  );
}

function recordIdOf(entry: JsonObject, occurredAt: string): string | null {
  const requestId = text(entry, 'requestId');
  if (requestId) return nativeId(requestId);
  return (
    nativeId(text(entry, 'sessionId'), text(entry, 'turnId'), occurredAt) ??
    nativeId(text(entry, 'sessionId'), occurredAt) ??
    nativeId(occurredAt)
  );
}

function recordFrom(line: string): UsageRecord | null {
  const entry = parseObject(line);
  if (!entry) return null;
  const usage = child(child(entry, 'response'), 'usage');
  if (!usage) return null;
  const model = modelOf(entry);
  if (!model) return null;
  const occurredAt = isoTime(entry?.completedAt);
  if (!occurredAt) return null;
  const recordId = recordIdOf(entry, occurredAt);
  if (!recordId) return null;
  const record: UsageRecord = {
    source: 'zcode',
    recordId,
    model,
    occurredAt,
    inputTokens: count(usage, 'inputTokens'),
    outputTokens: count(usage, 'outputTokens'),
    cacheReadTokens: count(usage, 'cacheReadTokens'),
    cacheWriteTokens: 0,
    reasoningTokens: count(usage, 'reasoningTokens'),
  };
  return hasTokens(record) ? record : null;
}

export async function parseZcodeFile(path: string): Promise<UsageRecord[] | null> {
  const into = new Map<string, UsageRecord>();
  const ok = await eachLine(path, (line) => {
    if (!bytesHave(line, MARKERS)) return;
    const record = recordFrom(line.toString('utf8'));
    if (record) into.set(record.recordId, record);
  });
  return ok ? [...into.values()] : null;
}
