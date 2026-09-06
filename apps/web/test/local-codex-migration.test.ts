import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
it("preserves populated research, promotions and planning when widening the provider constraint in D1", async () => {
  const database = env.MIGRATION_DB;
  const migration = env.TEST_MIGRATIONS.find((m) =>
    m.name.startsWith("0012_"),
  )!;
  expect(migration).toBeDefined();
  await applyD1Migrations(
    database,
    env.TEST_MIGRATIONS.filter((m) => !m.name.startsWith("0012_")),
  );
  await database.batch(
    env.TEST_SEED_QUERIES.map((sql) => database.prepare(sql)),
  );
  await database
    .prepare(
      `INSERT INTO research_result_promotions (result_id,workspace_id,collection_id,item_id,product_id,candidate_id,merchant_id,offer_id,price_check_id,promoted_by_user_id,promoted_at) VALUES ('dev-research-result-chair','dev-workspace','dev-collection','dev-item-chairs','fixture-product','fixture-candidate','fixture-merchant','fixture-offer','fixture-check','dev-user',12345)`,
    )
    .run();
  const tables = [
    "research_requests",
    "research_runs",
    "research_sources",
    "research_results",
    "research_result_promotions",
    "items",
    "item_candidates",
    "offers",
  ];
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        tables.map(async (table) => [
          table,
          (
            await database
              .prepare(`select * from ${table} order by rowid`)
              .all()
          ).results,
        ]),
      ),
    );
  const before = await snapshot();
  for (const table of tables.slice(0, 5))
    expect(before[table].length).toBeGreaterThan(0);
  expect(
    await database.prepare("PRAGMA foreign_keys").first("foreign_keys"),
  ).toBe(1);
  // Simulate a late migration error: D1 must roll back both schema and data.
  await expect(
    database.batch([
      ...migration.queries.map((sql) => database.prepare(sql)),
      database.prepare("select * from intentional_missing_rollback_probe"),
    ]),
  ).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
  await applyD1Migrations(database, [migration]);
  expect(await snapshot()).toEqual(before);
  expect(
    (await database.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
  expect(
    (
      await database
        .prepare(
          "select name from sqlite_master where name like '__local_backup_%'",
        )
        .all()
    ).results,
  ).toEqual([]);
  await database
    .prepare("update research_runs set provider='local-codex-v1'")
    .run();
  expect(
    await database
      .prepare("select provider from research_runs")
      .first("provider"),
  ).toBe("local-codex-v1");
});
