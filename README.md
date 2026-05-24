# Repitol

飲食店向け LINE 公式アカウント運用プラットフォーム。スタンプカード、クーポン配布、自動配信、来店促進をワンストップで提供する。

## 主要機能

- **LINE 連携**: Messaging API + LIFF によるスタンプ・クーポン UI
- **スタンプカード**: 中間特典・最終特典の二段階リワード
- **クーポンテンプレート**: 友だち追加時 / 毎月 / 達成時の配信ルール
- **自動配信トリガー**: `first_visit` / 定期 / イベント駆動
- **管理画面**: 店舗オーナー向けダッシュボード（Supabase Auth）
- **QR スタンプ**: 来店時に QR をスキャンしてスタンプ付与

## 技術スタック

- **Frontend**: Next.js 16 (App Router) / React 19 / Tailwind v4 / shadcn
- **Backend**: Next.js Route Handlers / Server Actions
- **DB / Auth**: Supabase (Postgres + RLS)
- **LINE**: `@line/liff` + Messaging API
- **その他**: Zod, html5-qrcode, ExcelJS

## セットアップ

```bash
npm install
cp .env.example .env.local  # 必要な値を埋める
npm run dev
```

### 必要な環境変数

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_LIFF_ID=
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
```

### データベース

`supabase/migrations/` 配下の SQL を Supabase プロジェクトに適用する。デモ店舗 (Demo Restaurant Shop A / B) のシードを `007_fix_all.sql` で投入できる。

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/           # ログイン・サインアップ
│   ├── dashboard/        # 店舗管理画面
│   ├── liff/             # LIFF エンドポイント
│   └── api/              # Route Handlers (webhook, QR 検証 等)
├── components/
└── lib/
    ├── supabase/         # client / server / middleware
    └── line/             # Messaging API ラッパ
supabase/
└── migrations/           # スキーマ + デモシード
```

## License

MIT License — see [LICENSE](./LICENSE).
