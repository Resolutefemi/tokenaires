import type { UsageRecord } from '@tokenaires/contracts';
import { eachLine } from '@/files/lines';
import { bytesHave, child, count, isoTime, markerBuffers, nativeId, parseObject, text } from '@/parsers/json';
import { hasTokens, keepLargest } from '@/parsers/merge';

const SYNTHETIC_MODEL = '<synthetic>';
const MARKERS = markerBuffers('"usage"');

function recordFrom(line: string): UsageRecord | null {
  const entry = parseObject(line);
  const message = child(entry, 'message');
  const usage = child(message, 'usage');
  const messageId = text(message, 'id');
  if (!usage || !messageId) return null;
  const model = text(message, 'model');
  if (!model || model === SYNTHETIC_MODEL) return null;
  const occurredAt = isoTime(entry?.timestamp);
  if (!occurredAt) return null;
  const recordId = text(entry, 'requestId') ? nativeId(messageId, text(entry, 'requestId')) : nativeId(messageId);
  if (!recordId) return null;
  const record: UsageRecord = {
    source: 'zcode',
    recordId,
    model,
    occurredAt,
    inputTokens: count(usage, 'input_tokens'),
    outputTokens: count(usage, 'output_tokens'),
    cacheReadTokens: count(usage, 'cache_read_input_tokens'),
    cacheWriteTokens: count(usage, 'cache_creation_input_tokens'),
    reasoningTokens: count(child(usage, 'output_tokens_details'), 'thinking_tokens'),
  };
  return hasTokens(record) ? record : null;
}

export async function parseZcodeFile(path: string): Promise<UsageRecord[] | null> {
  const into = new Map<string, UsageRecord>();
  const ok = await eachLine(path, (line) => {
    if (!bytesHave(line, MARKERS)) return;
    const record = recordFrom(line.toString('utf8'));
    if (record) keepLargest(into, record);
  });
  return ok ? [...into.values()] : null;
}
