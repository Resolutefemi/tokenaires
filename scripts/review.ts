import postgres from 'postgres';

const USAGE =
  'Usage: pnpm review list | pnpm review clear <handle> | pnpm review spike <handle> [--apply]';

interface SpikeBucket {
  kind: string;
  bucket: string;
  unit: 'hour' | 'day';
  records: number;
  tokens: number;
}

const SPIKE_UNITS = ['hour', 'day'] as const;

interface ReviewRow {
  handle: string;
  total: string | null;
  flags: Array<{
    kind: string;
    detail: Record<string, unknown>;
    at: string;
  }> | null;
}

async function list(sql: postgres.Sql): Promise<void> {
  const rows = await sql<ReviewRow[]>`
    select u.handle,
      (select sum(d.total_tokens) from daily_usage d where d.user_id = u.id)::text as total,
      (select json_agg(json_build_object('kind', f.kind, 'detail', f.detail, 'at', f.created_at) order by f.created_at)
        from flags f where f.user_id = u.id and f.resolved_at is null) as flags
    from users u
    where u.status = 'review'
    order by u.handle`;
  if (rows.length === 0) {
    process.stdout.write('No accounts under review.\n');
    return;
  }
  for (const row of rows) {
    process.stdout.write(`@${row.handle}  ${row.total ?? '0'} tokens\n`);
    for (const flag of row.flags ?? []) {
      process.stdout.write(
        `  ${flag.at}  ${flag.kind}  ${JSON.stringify(flag.detail)}\n`,
      );
    }
  }
}

async function clear(sql: postgres.Sql, handle: string): Promise<void> {
  const cleared = await sql.begin(async (tx) => {
    const [user] = await tx<{ id: string }[]>`
      update users set status = 'ok' where lower(handle) = lower(${handle}) returning id`;
    if (!user) return false;
    await tx`update flags set resolved_at = now() where user_id = ${user.id} and resolved_at is null`;
    return true;
  });
  process.stdout.write(
    cleared
      ? `@${handle} cleared and back on the board.\n`
      : `No user @${handle}.\n`,
  );
  if (!cleared) process.exitCode = 1;
}

async function userId(
  sql: postgres.Sql | postgres.TransactionSql,
  handle: string,
): Promise<string | null> {
  const [user] = await sql<{ id: string }[]>`
    select id from users where lower(handle) = lower(${handle})`;
  return user?.id ?? null;
}

async function spikeBuckets(
  sql: postgres.Sql | postgres.TransactionSql,
  id: string,
): Promise<SpikeBucket[]> {
  const flags = await sql<{ kind: string; bucket: string }[]>`
    select distinct kind, detail->>'bucket' as bucket from flags
    where user_id = ${id} and resolved_at is null and detail ? 'bucket'
    order by bucket`;
  const buckets: SpikeBucket[] = [];
  for (const flag of flags) {
    const unit = SPIKE_UNITS.find((value) => flag.kind.endsWith(`_${value}`));
    if (!unit) continue;
    const [row] = await sql<{ records: string; tokens: string | null }[]>`
      select count(*) filter (where total_tokens > 0)::text as records, sum(total_tokens)::text as tokens
      from usage_records
      where user_id = ${id}
        and occurred_at >= ${flag.bucket}::timestamptz
        and occurred_at < ${flag.bucket}::timestamptz + ${`1 ${unit}`}::interval`;
    buckets.push({
      kind: flag.kind,
      bucket: flag.bucket,
      unit,
      records: Number(row?.records ?? 0),
      tokens: Number(row?.tokens ?? 0),
    });
  }
  return buckets;
}

async function totalOf(
  sql: postgres.Sql | postgres.TransactionSql,
  id: string,
): Promise<number> {
  const [row] = await sql<{ total: string | null }[]>`
    select sum(total_tokens)::text as total from daily_usage where user_id = ${id}`;
  return Number(row?.total ?? 0);
}

async function spike(
  sql: postgres.Sql,
  handle: string,
  apply: boolean,
): Promise<void> {
  const id = await userId(sql, handle);
  if (!id) {
    process.stdout.write(`No user @${handle}.\n`);
    process.exitCode = 1;
    return;
  }
  const buckets = await spikeBuckets(sql, id);
  if (buckets.length === 0) {
    process.stdout.write(`@${handle} has no open spike flags.\n`);
    return;
  }
  const before = await totalOf(sql, id);
  for (const bucket of buckets) {
    process.stdout.write(
      `${bucket.kind}  ${bucket.bucket}  ${bucket.records} records  ${bucket.tokens} tokens\n`,
    );
  }
  if (!apply) {
    process.stdout.write(
      `Total now ${before}. Run again with --apply to zero these records, rebuild the affected days and clear the review.\n`,
    );
    return;
  }
  const after = await sql.begin(async (tx) => {
    const days = new Set<string>();
    for (const bucket of buckets) {
      const touched = await tx<{ day: string }[]>`
        update usage_records
        set input_tokens = 0, output_tokens = 0, cache_read_tokens = 0,
          cache_write_tokens = 0, reasoning_tokens = 0, total_tokens = 0
        where user_id = ${id}
          and occurred_at >= ${bucket.bucket}::timestamptz
          and occurred_at < ${bucket.bucket}::timestamptz + ${`1 ${bucket.unit}`}::interval
        returning day::text as day`;
      for (const row of touched) days.add(row.day);
    }
    const affected = [...days];
    if (affected.length > 0) {
      await tx`delete from daily_usage where user_id = ${id} and day = any(${affected}::date[])`;
      await tx`
        insert into daily_usage (user_id, day, source, model, records, input_tokens, output_tokens,
          cache_read_tokens, cache_write_tokens, reasoning_tokens, total_tokens)
        select user_id, day, source, model, count(*) filter (where total_tokens > 0),
          sum(input_tokens), sum(output_tokens), sum(cache_read_tokens),
          sum(cache_write_tokens), sum(reasoning_tokens), sum(total_tokens)
        from usage_records
        where user_id = ${id} and day = any(${affected}::date[])
        group by user_id, day, source, model
        having sum(total_tokens) > 0`;
    }
    await tx`update users set status = 'ok' where id = ${id}`;
    await tx`update flags set resolved_at = now() where user_id = ${id} and resolved_at is null`;
    return totalOf(tx, id);
  });
  process.stdout.write(
    `Removed ${before - after} tokens. @${handle} total is now ${after}, cleared and back on the board.\n`,
  );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const [command, handle] = process.argv.slice(2);
  const sql = postgres(url, { max: 1 });
  try {
    if (command === 'list') await list(sql);
    else if (command === 'spike' && handle)
      await spike(
        sql,
        handle.replace(/^@/, ''),
        process.argv.slice(2).includes('--apply'),
      );
    else if (command === 'clear' && handle)
      await clear(sql, handle.replace(/^@/, ''));
    else throw new Error(USAGE);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
