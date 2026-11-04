import { BoardPeriod, BoardSource } from '@tokenaires/contracts';
import { sql, SQL } from 'drizzle-orm';
import { BOARD_WINDOWS_DAYS, MOVEMENT_WINDOW_DAYS } from '../config/constants';

export const RANKABLE = sql`u.hidden = false and u.status = 'ok'`;

export function periodFilter(period: BoardPeriod): SQL {
  if (period === 'all') return sql`true`;
  return sql`d.day > current_date - ${BOARD_WINDOWS_DAYS[period]}::int`;
}

export function sourceFilter(source: BoardSource): SQL {
  return source === 'all' ? sql`true` : sql`d.source = ${source}`;
}

export function rankedTotals(period: BoardPeriod, source: BoardSource): SQL {
  return sql`
    select
      u.id as user_id,
      sum(d.total_tokens)::bigint as tokens,
      sum(d.output_tokens)::bigint as output_tokens,
      array_agg(distinct d.source) as sources,
      row_number() over (order by sum(d.total_tokens) desc, u.created_at asc) as rank
    from daily_usage d
    join users u on u.id = d.user_id
    where ${RANKABLE} and ${periodFilter(period)} and ${sourceFilter(source)}
    group by u.id, u.created_at
    having sum(d.total_tokens) > 0
  `;
}

export function previousRanks(source: BoardSource): SQL {
  return sql`
    select
      u.id as user_id,
      row_number() over (order by sum(d.total_tokens) desc, u.created_at asc) as rank
    from daily_usage d
    join users u on u.id = d.user_id
    where ${RANKABLE}
      and d.day <= current_date - ${MOVEMENT_WINDOW_DAYS}::int
      and ${sourceFilter(source)}
    group by u.id, u.created_at
    having sum(d.total_tokens) > 0
  `;
}
