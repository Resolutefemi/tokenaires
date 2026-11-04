import postgres from 'postgres';

const USAGE = 'Usage: pnpm review list | pnpm review clear <handle>';

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

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const [command, handle] = process.argv.slice(2);
  const sql = postgres(url, { max: 1 });
  try {
    if (command === 'list') await list(sql);
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
