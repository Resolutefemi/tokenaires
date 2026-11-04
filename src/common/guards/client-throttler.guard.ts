import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { sha256Hex } from '../utils/crypto';

const BEARER = /^Bearer\s+(\S+)$/i;
const CLIENT_IP_HEADER = 'cf-connecting-ip';
const TOKEN_KEY_LENGTH = 32;

interface TrackedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

function headerValue(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export function clientTracker(req: TrackedRequest): string {
  const bearer = BEARER.exec(headerValue(req.headers.authorization));
  if (bearer) return `token:${sha256Hex(bearer[1]).slice(0, TOKEN_KEY_LENGTH)}`;
  const forwarded = headerValue(req.headers[CLIENT_IP_HEADER]);
  return `ip:${forwarded || req.ip || 'unknown'}`;
}

@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(clientTracker(req as unknown as TrackedRequest));
  }
}
