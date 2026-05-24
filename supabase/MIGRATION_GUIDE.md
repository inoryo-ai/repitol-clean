# Supabase Migration 運用ガイド

## 原則
1. **migration ファイルは追加のみ**。既に本番適用したファイルを書き換えない
2. **連番で管理**。次の番号は `schema_migrations` テーブルの最新値 + 1
3. **transaction 前提**。エラーで全巻き戻りする設計
4. **適用後に `schema_migrations` に記録する**

## 現状把握

適用済み migration 一覧の確認:

```sql
SELECT version, name, applied_at FROM public.schema_migrations ORDER BY version;
```

ファイルシステム側:
```
supabase/migrations/
├── 001_repitoru_schema.sql
├── 002_demo_restaurant.sql
├── ...
├── 015_schema_migrations_tracking.sql
└── MIGRATION_GUIDE.md (this file)
```

## 新しい migration の作り方

1. 番号決定: `schema_migrations` の最新 +1（例: 016）
2. ファイル作成: `016_<小文字スネークケースの内容>.sql`
3. SQL 書く。末尾に必ず以下を入れる:

```sql
INSERT INTO public.schema_migrations (version, name, note) VALUES
  ('016', 'your_migration_name', '一言説明')
ON CONFLICT (version) DO NOTHING;
```

4. 本番適用前のチェック:
   - 破壊的変更（DROP TABLE / DROP COLUMN）を含むか？含むなら先にバックアップ
   - `ON CONFLICT` や `IF NOT EXISTS` で冪等性を持たせる
   - 想定件数でパフォーマンス懸念ないか

5. 適用: Supabase Dashboard SQL Editor または Management API で実行

```bash
SUPABASE_PAT=sbp_xxx node -e "
import('node:fs').then(async fs => {
  const sql = fs.readFileSync('supabase/migrations/016_xxx.sql', 'utf8');
  const res = await fetch('https://api.supabase.com/v1/projects/gonmcvmpaedcfedskthq/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.SUPABASE_PAT, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  console.log(res.status, await res.text());
});
"
```

6. 結果検証: 末尾の SELECT 結果を目視確認

## 破壊的変更のチェックリスト

以下を含む migration は事前バックアップ必須:
- `DROP TABLE`
- `DROP COLUMN`
- `TRUNCATE`
- 大量 UPDATE/DELETE
- NOT NULL 制約の追加（既存データ違反の可能性）

バックアップ方法:

```bash
# pg_dump は PC に psql/pg_dump が必要
# 代替: Supabase Dashboard → Database → Backups で PITR 確認 (Free 7日)
# または全テーブル SELECT で snapshot JSON 保存
```

## 環境を新しく作るとき

1. 新 Supabase プロジェクト作成
2. `supabase/migrations/` の 001〜最新 を順に実行
3. `schema_migrations` テーブルで全部適用されてるか確認

## トラブル対応

### migration が途中で失敗した
- PostgreSQL はデフォルトで autocommit だが、migration は通常 transaction 内で実行されるので巻き戻り済
- `schema_migrations` に記録されてない = 未適用扱いで再実行OK

### schema が想定と違う
- `SELECT column_name FROM information_schema.columns WHERE table_name = 'xxx'` で実状確認
- 差分があれば新 migration で補修
