import { resolveApiUrl } from '@/config';
import type { Context } from '@/context';
import { createClient } from '@/api/client';
import { revokeDevice } from '@/api/endpoints';
import { ApiError } from '@/api/errors';
import { configPath, deleteConfig, loadConfig } from '@/store';
import { symbols, theme } from '@/ui/theme';

const UNAUTHORIZED = 401;

async function revoke(ctx: Context, apiUrl: string, token: string): Promise<boolean> {
  try {
    await revokeDevice(createClient(resolveApiUrl(ctx.env, apiUrl), ctx.fetch), token);
    return true;
  } catch (error) {
    return error instanceof ApiError && error.status === UNAUTHORIZED;
  }
}

export async function logout(ctx: Context): Promise<void> {
  const path = configPath(ctx.env, ctx.home);
  const config = await loadConfig(path).catch(() => null);
  const revoked = config ? await revoke(ctx, config.apiUrl, config.token) : false;
  const removed = await deleteConfig(path);
  if (!removed) {
    ctx.out.line('  You were not logged in.');
    return;
  }
  ctx.out.line(`  ${theme.good(symbols.tick)} Logged out. This device's key was removed.`);
  if (!revoked) {
    ctx.out.line(theme.dim('  Tokenaires could not be reached, so the server still accepts this device token. The key on this machine is gone, so nothing here can use it.'));
  }
}
