import { join } from 'node:path';
import { ENV_KEYS, readEnv } from '@/config';
import { findAll, isJsonl } from '@/files/walk';
import { wslHomes } from '@/files/wsl';
import { parseZcodeFile } from '@/parsers/zcode';
import { zcodeRoots } from '@/parsers/paths';
import type { LogSource, SourceContext } from '@/sources/types';

async function roots(ctx: SourceContext): Promise<string[]> {
  const base = zcodeRoots(ctx.env, ctx.home);
  if (readEnv(ctx.env, ENV_KEYS.zcodeConfig)) return base;
  const homes = await wslHomes(ctx.platform);
  return [...base, ...homes.flatMap((home) => [join(home, '.zcode', 'projects'), join(home, '.config', 'zcode', 'projects')])];
}

export const zcodeSource: LogSource = {
  source: 'zcode',
  async discover(ctx) {
    return findAll(await roots(ctx), isJsonl);
  },
  parse: parseZcodeFile,
};
