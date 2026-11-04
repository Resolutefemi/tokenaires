import { Injectable } from '@nestjs/common';
import { BoardPeriod, BoardSource } from '@tokenaires/contracts';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { previousRanks, RANKABLE, rankedTotals } from './boards.query';

export interface BoardRow extends Record<string, unknown> {
  rank: string;
  previous_rank: string | null;
  tokens: string;
  output_tokens: string;
  sources: string[];
  handle: string;
  name: string | null;
  avatar_url: string | null;
  country: string | null;
  status: 'ok' | 'review';
}

export interface StatsRow extends Record<string, unknown> {
  developers: string;
  total_tokens: string | null;
  tokens_last_24h: string | null;
}

@Injectable()
export class BoardsRepository {
  constructor(private readonly database: DatabaseService) {}

  async page(
    period: BoardPeriod,
    source: BoardSource,
    offset: number,
    limit: number,
  ): Promise<{ rows: BoardRow[]; total: number; leader: number }> {
    const movement = period === 'all';
    const rows = await this.database.db.execute<BoardRow>(sql`
      with ranked as (${rankedTotals(period, source)}),
      previous as (${movement ? previousRanks(source) : sql`select null::text as user_id, null::bigint as rank where false`})
      select r.rank, p.rank as previous_rank, r.tokens, r.output_tokens, r.sources,
        u.handle, u.name, u.avatar_url, u.country, u.status
      from ranked r
      join users u on u.id = r.user_id
      left join previous p on p.user_id = r.user_id
      order by r.rank
      offset ${offset} limit ${limit}
    `);
    const [count] = await this.database.db.execute<{
      total: string;
      leader: string | null;
    }>(sql`
      select count(*)::int as total, max(tokens) as leader from (${rankedTotals(period, source)}) ranked
    `);
    return {
      rows: [...rows],
      total: Number(count?.total ?? 0),
      leader: Number(count?.leader ?? 0),
    };
  }

  async rankOf(userId: string, period: BoardPeriod): Promise<number | null> {
    const [row] = await this.database.db.execute<{ rank: string }>(sql`
      select rank from (${rankedTotals(period, 'all')}) ranked where user_id = ${userId}
    `);
    return row ? Number(row.rank) : null;
  }

  async stats(): Promise<StatsRow> {
    const [row] = await this.database.db.execute<StatsRow>(sql`
      select
        (select count(distinct d.user_id) from daily_usage d join users u on u.id = d.user_id where ${RANKABLE}) as developers,
        (select sum(d.total_tokens) from daily_usage d join users u on u.id = d.user_id where ${RANKABLE}) as total_tokens,
        (select sum(r.total_tokens) from usage_records r join users u on u.id = r.user_id
          where ${RANKABLE} and r.occurred_at > now() - interval '24 hours') as tokens_last_24h
    `);
    return row;
  }
}
