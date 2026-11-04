import {
  DevicePollResponseSchema,
  DeviceStartResponseSchema,
  IngestResultSchema,
  MeSummarySchema,
  SIGNATURE_HEADERS,
  type DevicePollRequest,
  type DevicePollResponse,
  type DeviceStartResponse,
  type IngestResult,
  type MeSummary,
} from '@tokenaires/contracts';
import { API_PATHS } from '@/config';
import type { ApiClient, Schema } from '@/api/client';
import { isObject } from '@/parsers/json';
import { signBody } from '@/api/signing';

export interface Credentials {
  token: string;
  deviceId: string;
  privateKeyPem: string;
}

export function startDeviceLogin(client: ApiClient): Promise<DeviceStartResponse> {
  return client.request(API_PATHS.deviceStart, DeviceStartResponseSchema, { method: 'POST', body: '{}' });
}

export function pollDeviceLogin(client: ApiClient, request: DevicePollRequest): Promise<DevicePollResponse> {
  return client.request(API_PATHS.devicePoll, DevicePollResponseSchema, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

export function fetchMe(client: ApiClient, token: string): Promise<MeSummary> {
  return client.request(API_PATHS.me, MeSummarySchema, { method: 'GET', token });
}

const RevokedSchema: Schema<true> = {
  safeParse: (value) => (isObject(value) && value.revoked === true ? { success: true, data: true } : { success: false }),
};

export function revokeDevice(client: ApiClient, token: string): Promise<true> {
  return client.request(API_PATHS.logout, RevokedSchema, { method: 'POST', token, body: '{}' });
}

export function uploadBatch(
  client: ApiClient,
  credentials: Credentials,
  body: string,
): Promise<IngestResult> {
  const signed = signBody(credentials.privateKeyPem, body, client.serverTime());
  return client.request(API_PATHS.batches, IngestResultSchema, {
    method: 'POST',
    token: credentials.token,
    body,
    headers: {
      [SIGNATURE_HEADERS.device]: credentials.deviceId,
      [SIGNATURE_HEADERS.timestamp]: signed.timestamp,
      [SIGNATURE_HEADERS.signature]: signed.signature,
    },
  });
}
