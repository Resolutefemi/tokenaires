import type { MeSummary } from '@tokenaires/contracts';
import { profileUrl, resolveApiUrl } from '@/config';
import type { Context } from '@/context';
import { createClient, type ApiClient } from '@/api/client';
import { fetchMe, uploadBatch } from '@/api/endpoints';
import { UsageError, NOT_LOGGED_IN_MESSAGE } from '@/api/errors';
import { withRateLimitRetry } from '@/api/retry';
import { addResult, emptySyncTotals, type SyncTotals } from '@/ingest-totals';
import { BATCH_RECORDS, batchBodies, prepareRecords, selectForUpload } from '@/payload';
import { scanLocal, type ScanResult } from '@/scan';
import type { ScanProgress } from '@/scan-progress';
import { configPath, loadConfig, type StoredConfig } from '@/store';
import { summarize } from '@/summary';
import { markFullUpload, needsFullUpload, syncStatePath } from '@/sync-state';
import { tierLabel } from '@/ui/card';
import { formatCompact, formatDuration, formatInt, plural } from '@/ui/format';
import { barLine, elapsed, withTask, type Task } from '@/ui/live';
import { renderScanProgress, scanDoneText } from '@/ui/scan-progress';
import { renderSyncReport } from '@/ui/sync-report';
import { symbols, theme } from '@/ui/theme';

export interface SyncOptions {
  quiet: boolean;
  justLoggedIn?: boolean;
}

const ETA_AFTER_MS = 1500;

interface UploadState {
  total: number;
  sent: number;
  started: number;
  resumeAt: number | null;
  totals: SyncTotals;
  logWaits: boolean;
}

function connectedText(me: MeSummary): string {
  const tokens = me.totalTokens > 0 ? ` ${symbols.dot} ${formatCompact(me.totalTokens)} tokens on the board` : '';
  return `Signed in as ${theme.strong(`@${me.user.handle}`)} ${theme.dim(`${symbols.dot} ${tierLabel(me.tier)}${tokens}`)}`;
}

function scannedText(result: ScanResult): string {
  const base = scanDoneText(result);
  if (result.records.length === 0) return base;
  const total = summarize(result.records, 0).overall.total;
  return `${base} ${symbols.dot} ${theme.strong(formatCompact(total))} tokens in ${plural(result.records.length, 'record', 'records')}`;
}

function renderUpload(ctx: Context, state: UploadState): string {
  const now = ctx.now();
  if (state.resumeAt !== null && state.resumeAt > now) {
    return `Server asked us to slow down ${symbols.dot} resuming in ${Math.ceil((state.resumeAt - now) / 1000)}s`;
  }
  const details = [`${formatInt(state.sent)}/${formatInt(state.total)} records`];
  if (state.totals.acceptedTokens > 0) details.push(`+${formatCompact(state.totals.acceptedTokens)} tokens`);
  const spent = now - state.started;
  if (state.sent > 0 && spent >= ETA_AFTER_MS && state.sent < state.total) {
    details.push(`~${formatDuration((spent / state.sent) * (state.total - state.sent))} left`);
  }
  return barLine(ctx, 'Uploading', state.sent / state.total, details);
}

async function scanStep(ctx: Context, quiet: boolean): Promise<ScanResult> {
  let progress: Readonly<ScanProgress> | null = null;
  const started = ctx.now();
  return withTask(
    ctx,
    () => renderScanProgress(ctx, progress),
    async (task) => {
      const result = await scanLocal({
        env: ctx.env,
        home: ctx.home,
        platform: ctx.platform,
        onProgress: (next) => {
          progress = next;
        },
      });
      task.succeed(`${scannedText(result)} ${elapsed(ctx, started)}`);
      return result;
    },
    { silent: quiet },
  );
}

async function sendBatches(ctx: Context, client: ApiClient, config: StoredConfig, bodies: readonly string[], state: UploadState, task: Task): Promise<void> {
  for (const body of bodies) {
    const result = await withRateLimitRetry(() => uploadBatch(client, config, body), {
      sleep: (ms) => ctx.sleep(ms),
      onWait: (ms) => {
        state.resumeAt = ctx.now() + ms;
        if (state.logWaits) ctx.out.line(theme.dim(`  Server asked us to slow down, waiting ${Math.ceil(ms / 1000)}s`));
      },
    });
    state.resumeAt = null;
    addResult(state.totals, result);
    state.sent = Math.min(state.total, state.sent + BATCH_RECORDS);
  }
  task.succeed(`Uploaded ${plural(state.total, 'record', 'records')} ${elapsed(ctx, state.started)}`);
}

async function upload(ctx: Context, client: ApiClient, config: StoredConfig, me: MeSummary, quiet: boolean): Promise<SyncTotals> {
  const scanned = await scanStep(ctx, quiet);
  const statePath = syncStatePath(ctx.env, ctx.home);
  const full = await needsFullUpload(statePath, config.handle);
  const prepared = prepareRecords(full ? scanned.records : selectForUpload(scanned.records, me.cursors));
  const bodies = batchBodies(prepared.valid);
  const state: UploadState = {
    total: prepared.valid.length,
    sent: 0,
    started: ctx.now(),
    resumeAt: null,
    totals: emptySyncTotals(prepared.invalid),
    logWaits: !quiet && !ctx.term.interactive,
  };
  if (state.total === 0) {
    if (!quiet) ctx.out.line(`  ${theme.good(symbols.tick)} Up to date ${theme.dim(`${symbols.dot} nothing new to upload`)}`);
  } else {
    await withTask(ctx, () => renderUpload(ctx, state), (task) => sendBatches(ctx, client, config, bodies, state, task), { silent: quiet });
  }
  if (full) await markFullUpload(statePath, config.handle);
  return state.totals;
}

export async function sync(ctx: Context, options: SyncOptions, existing?: StoredConfig): Promise<SyncTotals> {
  const config = existing ?? (await loadConfig(configPath(ctx.env, ctx.home)));
  if (!config) throw new UsageError(NOT_LOGGED_IN_MESSAGE);
  const client = createClient(resolveApiUrl(ctx.env, config.apiUrl), ctx.fetch, () => ctx.now());
  const silent = { silent: options.quiet };
  const before = await withTask(
    ctx,
    () => 'Checking your account',
    async (task) => {
      const me = await fetchMe(client, config.token);
      if (options.justLoggedIn) task.clear();
      else task.succeed(connectedText(me));
      return me;
    },
    silent,
  );
  const totals = await upload(ctx, client, config, before, options.quiet);
  const after = totals.accepted > 0 ? await withTask(ctx, () => 'Updating your rank', () => fetchMe(client, config.token), silent) : before;
  if (!options.quiet) {
    for (const line of renderSyncReport(ctx, totals, after, profileUrl(ctx.env, after.user.handle))) ctx.out.line(line);
  }
  return totals;
}
