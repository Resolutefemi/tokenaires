import { Injectable } from '@nestjs/common';
import { IngestResult, RejectionReason } from '@tokenaires/contracts';
import { AuthenticatedDevice } from '../common/guards/authenticated-device';
import { UsageRecordRow } from '../database/schema';
import { IngestBatchDto } from './dto/ingest-batch.dto';
import { rollupDaily, toRow } from './usage.aggregate';
import { UsageRepository } from './usage.repository';
import {
  evaluateRecord,
  HISTORY_JUMP,
  historyJumps,
  RateLimit,
  rateBreaches,
} from './usage.rules';

type Transaction = Parameters<Parameters<UsageRepository['transaction']>[0]>[0];

const METRIC_FLAG = {
  outputTokens: 'output',
  totalTokens: 'total',
  records: 'records',
} as const;

function flagKind(rate: RateLimit): string {
  return `${METRIC_FLAG[rate.metric]}_rate_${rate.unit}`;
}

@Injectable()
export class UsageService {
  constructor(private readonly repository: UsageRepository) {}

  async ingest(
    device: AuthenticatedDevice,
    batch: IngestBatchDto,
  ): Promise<IngestResult> {
    const now = Date.now();
    const rejected = new Map<RejectionReason, number>();
    const reject = (reason: RejectionReason, count = 1) =>
      rejected.set(reason, (rejected.get(reason) ?? 0) + count);
    const candidates = new Map<string, UsageRecordRow>();
    for (const record of batch.records) {
      const reason = evaluateRecord(record, now);
      if (reason) reject(reason);
      else
        candidates.set(
          `${record.source}|${record.recordId}`,
          toRow(record, device.userId, device.deviceId),
        );
    }
    const rows = [...candidates.values()];

    return this.repository.transaction(async (tx) => {
      const inserted = await this.repository.insertRecords(tx, rows);
      const insertedKeys = new Set(
        inserted.map((row) => `${row.source}|${row.recordId}`),
      );
      const accepted = rows.filter((row) =>
        insertedKeys.has(`${row.source}|${row.recordId}`),
      );
      const conflicts = rows.filter(
        (row) => !insertedKeys.has(`${row.source}|${row.recordId}`),
      );
      const claimed = await this.claimedByOthers(tx, device.userId, conflicts);
      if (claimed.size > 0) {
        reject(
          'claimed_by_other_user',
          [...claimed.values()].reduce((sum, count) => sum + count, 0),
        );
        await this.flagSharedRecords(tx, device.userId, claimed);
      }
      await this.repository.addDaily(tx, rollupDaily(accepted));
      const alreadyInReview =
        (await this.repository.userStatus(tx, device.userId)) === 'review';
      if (accepted.length > 0 && !alreadyInReview)
        await this.checkRates(tx, device.userId, accepted);
      await this.repository.touchSync(tx, device.userId, device.deviceId);
      const status = await this.repository.userStatus(tx, device.userId);
      const claimedCount = [...claimed.values()].reduce(
        (sum, count) => sum + count,
        0,
      );
      return {
        accepted: accepted.length,
        duplicates: conflicts.length - claimedCount,
        rejected: [...rejected.entries()].map(([reason, count]) => ({
          reason,
          count,
        })),
        acceptedTokens: accepted.reduce(
          (sum, row) => sum + (row.totalTokens ?? 0),
          0,
        ),
        underReview: status === 'review',
      };
    });
  }

  private async claimedByOthers(
    tx: Transaction,
    userId: string,
    conflicts: UsageRecordRow[],
  ): Promise<Map<string, number>> {
    const bySource = new Map<string, string[]>();
    for (const row of conflicts) {
      bySource.set(row.source, [
        ...(bySource.get(row.source) ?? []),
        row.recordId,
      ]);
    }
    const claimedByOwner = new Map<string, number>();
    for (const [source, recordIds] of bySource) {
      const owners = await this.repository.ownersOf(tx, source, recordIds);
      for (const owner of owners.values()) {
        if (owner !== userId)
          claimedByOwner.set(owner, (claimedByOwner.get(owner) ?? 0) + 1);
      }
    }
    return claimedByOwner;
  }

  private async flagSharedRecords(
    tx: Transaction,
    userId: string,
    claimed: Map<string, number>,
  ): Promise<void> {
    for (const [ownerId, count] of claimed) {
      await this.repository.addFlag(tx, userId, 'shared_record_ids', {
        otherUserId: ownerId,
        count,
      });
      await this.repository.addFlag(tx, ownerId, 'records_reused_by_other', {
        otherUserId: userId,
        count,
      });
    }
    await this.repository.markForReview(tx, userId);
  }

  private async checkRates(
    tx: Transaction,
    userId: string,
    accepted: UsageRecordRow[],
  ): Promise<void> {
    const times = accepted.map((row) => row.occurredAt.getTime());
    const from = new Date(Math.min(...times));
    const to = new Date(Math.max(...times));
    let breached = false;
    for (const unit of ['hour', 'day'] as const) {
      const buckets = await this.repository.bucketTotals(
        tx,
        userId,
        unit,
        from,
        to,
      );
      for (const { rate, bucket } of rateBreaches(unit, buckets)) {
        breached = true;
        await this.repository.addFlag(tx, userId, flagKind(rate), {
          bucket: bucket.bucket,
          value: bucket[rate.metric],
          limit: rate.limit,
        });
      }
    }
    const touched = new Set(accepted.map((row) => row.day));
    const sortedDays = [...touched].sort();
    const firstDay = sortedDays[0];
    const lastDay = sortedDays[sortedDays.length - 1];
    if (firstDay && lastDay) {
      const lookbackStart = new Date(
        Date.parse(firstDay) - HISTORY_JUMP.lookbackDays * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      const days = await this.repository.dayTotals(
        tx,
        userId,
        lookbackStart,
        lastDay,
      );
      for (const jump of historyJumps(days, touched)) {
        breached = true;
        await this.repository.addFlag(tx, userId, 'history_jump_day', {
          bucket: `${jump.day}T00:00:00Z`,
          value: jump.totalTokens,
          baseline: jump.baseline,
        });
      }
    }
    if (breached) await this.repository.markForReview(tx, userId);
  }
}
