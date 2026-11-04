import { Injectable } from '@nestjs/common';
import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { AgentSource, AgentSourceSchema } from '@tokenaires/contracts';
import type { BucketTotals } from './usage.rules';
import { newId } from '../common/utils/ids';
import { Database, DatabaseService } from '../database/database.service';
import {
  dailyUsage,
  DailyUsageRow,
  devices,
  flags,
  usageRecords,
  UsageRecordRow,
  users,
} from '../database/schema';

export interface InsertedRecord {
  source: string;
  recordId: string;
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class UsageRepository {
  constructor(private readonly database: DatabaseService) {}

  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.database.db.transaction(work);
  }

  async insertRecords(
    tx: Transaction,
    rows: UsageRecordRow[],
  ): Promise<InsertedRecord[]> {
    if (rows.length === 0) return [];
    return tx
      .insert(usageRecords)
      .values(rows)
      .onConflictDoNothing()
      .returning({
        source: usageRecords.source,
        recordId: usageRecords.recordId,
      });
  }

  async ownersOf(
    tx: Transaction,
    source: string,
    recordIds: string[],
  ): Promise<Map<string, string>> {
    if (recordIds.length === 0) return new Map();
    const rows = await tx
      .select({ recordId: usageRecords.recordId, userId: usageRecords.userId })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.source, source),
          inArray(usageRecords.recordId, recordIds),
        ),
      );
    return new Map(rows.map((row) => [row.recordId, row.userId]));
  }

  async addDaily(tx: Transaction, rows: DailyUsageRow[]): Promise<void> {
    if (rows.length === 0) return;
    const add = (column: string) =>
      sql.raw(`daily_usage.${column} + excluded.${column}`);
    await tx
      .insert(dailyUsage)
      .values(rows)
      .onConflictDoUpdate({
        target: [
          dailyUsage.userId,
          dailyUsage.day,
          dailyUsage.source,
          dailyUsage.model,
        ],
        set: {
          records: add('records'),
          inputTokens: add('input_tokens'),
          outputTokens: add('output_tokens'),
          cacheReadTokens: add('cache_read_tokens'),
          cacheWriteTokens: add('cache_write_tokens'),
          reasoningTokens: add('reasoning_tokens'),
          totalTokens: add('total_tokens'),
        },
      });
  }

  async bucketTotals(
    tx: Transaction,
    userId: string,
    unit: 'hour' | 'day',
    from: Date,
    to: Date,
  ): Promise<BucketTotals[]> {
    const unitLiteral = sql.raw(unit === 'hour' ? `'hour'` : `'day'`);
    const bucket = sql<string>`date_trunc(${unitLiteral}, ${usageRecords.occurredAt})`;
    const rows = await tx
      .select({
        bucket,
        outputTokens: sql<string>`sum(${usageRecords.outputTokens})`,
        totalTokens: sql<string>`sum(${usageRecords.totalTokens})`,
        records: sql<string>`count(*)`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.userId, userId),
          sql`${usageRecords.occurredAt} >= date_trunc(${unitLiteral}, ${from.toISOString()}::timestamptz)`,
          sql`${usageRecords.occurredAt} < date_trunc(${unitLiteral}, ${to.toISOString()}::timestamptz) + ${`1 ${unit}`}::interval`,
        ),
      )
      .groupBy(bucket);
    return rows.map((row) => ({
      bucket: String(row.bucket),
      outputTokens: Number(row.outputTokens),
      totalTokens: Number(row.totalTokens),
      records: Number(row.records),
    }));
  }

  async addFlag(
    tx: Transaction,
    userId: string,
    kind: string,
    detail: Record<string, string | number>,
  ): Promise<void> {
    await tx.insert(flags).values({ id: newId(), userId, kind, detail });
  }

  async markForReview(tx: Transaction, userId: string): Promise<void> {
    await tx
      .update(users)
      .set({ status: 'review' })
      .where(eq(users.id, userId));
  }

  async touchSync(
    tx: Transaction,
    userId: string,
    deviceId: string,
  ): Promise<void> {
    const now = new Date();
    await tx
      .update(users)
      .set({ lastSyncedAt: now })
      .where(eq(users.id, userId));
    await tx
      .update(devices)
      .set({ lastSeenAt: now })
      .where(eq(devices.id, deviceId));
  }

  async userStatus(tx: Transaction, userId: string): Promise<'ok' | 'review'> {
    const [row] = await tx
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, userId));
    return row?.status ?? 'ok';
  }

  async cursors(
    userId: string,
  ): Promise<Array<{ source: AgentSource; lastOccurredAt: Date | null }>> {
    const rows = await this.database.db
      .select({
        source: usageRecords.source,
        lastOccurredAt: max(usageRecords.occurredAt),
      })
      .from(usageRecords)
      .where(eq(usageRecords.userId, userId))
      .groupBy(usageRecords.source);
    return rows.flatMap((row) => {
      const source = AgentSourceSchema.safeParse(row.source);
      return source.success
        ? [{ source: source.data, lastOccurredAt: row.lastOccurredAt }]
        : [];
    });
  }
}
