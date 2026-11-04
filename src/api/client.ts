import { REQUEST_TIMEOUT_MS } from '@/config';
import { ApiError } from '@/api/errors';
import { isObject } from '@/parsers/json';

export interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  token?: string;
  body?: string;
  headers?: Record<string, string>;
}

export interface ApiClient {
  request<T>(path: string, schema: Schema<T>, options: RequestOptions): Promise<T>;
  serverTime(): number;
}

export function serverOffset(dateHeader: string | null, localNow: number): number | null {
  if (!dateHeader) return null;
  const serverNow = Date.parse(dateHeader);
  return Number.isNaN(serverNow) ? null : serverNow - localNow;
}

function serverMessage(payload: unknown): string | null {
  if (!isObject(payload)) return null;
  const message = payload.message ?? (isObject(payload.error) ? payload.error.message : payload.error);
  if (typeof message === 'string' && message.length > 0) return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  return null;
}

export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (raw.length === 0) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function createClient(baseUrl: string, fetcher: typeof fetch, clock: () => number = Date.now): ApiClient {
  let offset = 0;
  return {
    serverTime: () => clock() + offset,
    async request<T>(path: string, schema: Schema<T>, options: RequestOptions): Promise<T> {
      const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
      if (options.body !== undefined) headers['content-type'] = 'application/json';
      if (options.token) headers.authorization = `Bearer ${options.token}`;
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}${path}`, {
          method: options.method,
          headers,
          ...(options.body === undefined ? {} : { body: options.body }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new ApiError(0, `Could not reach Tokenaires at ${baseUrl}. Check your connection and try again.`);
      }
      offset = serverOffset(response.headers.get('date'), clock()) ?? offset;
      const payload = await readJson(response);
      if (!response.ok) {
        const detail = serverMessage(payload);
        const message = detail ? `${detail} (HTTP ${response.status})` : `Request failed with HTTP ${response.status}.`;
        throw new ApiError(response.status, message, parseRetryAfter(response.headers.get('retry-after'), Date.now()));
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) throw new ApiError(response.status, 'Tokenaires sent a response this version does not understand. Try updating the CLI.');
      return parsed.data;
    },
  };
}
