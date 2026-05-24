"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Counts {
  n_employees: number;
  n_社員: number;
  n_アルバイト: number;
  n_staffing: number;
  n_plans: number;
}

export default function ShiftHubPage() {
  const [counts, setCounts] = useState<Counts>({
    n_employees: 0, n_社員: 0, n_アルバイト: 0, n_staffing: 0, n_plans: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch("/api/shift/employees").then((r) => r.json()),
          fetch("/api/shift/staffing").then((r) => r.json()),
        ]);
        if (cancelled) return;
        const emps = (r1.employees ?? []) as Array<{ category: string }>;
        setCounts({
          n_employees: emps.length,
          n_社員: emps.filter((e) => e.category === "社員").length,
          n_アルバイト: emps.filter((e) => e.category === "アルバイト").length,
          n_staffing: (r2.staffing ?? []).length,
          n_plans: 0,
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const tiles: Array<{
    href: string; title: string; desc: string;
    badge?: string; color?: string;
  }> = [
    {
      href: "/dashboard/shift/employees",
      title: "従業員管理",
      desc: "登録・雇用形態・時給・連絡先などのマスタ管理。JSON 一括取込にも対応。",
      badge: `${counts.n_employees}名 (社員${counts.n_社員} / バイト${counts.n_アルバイト})`,
      color: "bg-emerald-50",
    },
    {
      href: "/dashboard/shift/staffing",
      title: "必要人員設定",
      desc: "店舗 × 曜日 × 時間帯 ごとに必要な最低人員を設定。自動配置の制約として使用。",
      badge: `${counts.n_staffing}行 設定済`,
      color: "bg-amber-50",
    },
    {
      href: "/dashboard/shift/plan",
      title: "シフト計画",
      desc: "週単位で希望→自動配置→公開まで。配置は手動で微調整可。",
      color: "bg-sky-50",
    },
    {
      href: "/dashboard/shift/timeclock",
      title: "勤怠 (実績入力)",
      desc: "紙の打刻表からこちらに転記。月単位で従業員別に入力。計画から一括コピーも可。",
      color: "bg-violet-50",
    },
    {
      href: "/dashboard/shift/payroll",
      title: "給与集計",
      desc: "月次の合計時間と基本給を自動計算。CSV 出力対応。",
      color: "bg-rose-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">シフト管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          demo系列 (shop_a / shop_b / Shop C) の従業員・シフト計画・勤怠・給与を一括管理。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="block">
            <Card className={`transition-shadow hover:shadow-md ${t.color ?? ""}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  {t.title}
                  {t.badge && <Badge variant="secondary">{t.badge}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium">運用フロー</p>
        <ol className="mt-1 list-decimal pl-4 space-y-0.5">
          <li>初回: 従業員管理で JSON 一括取込 (or 手動登録) → 雇用形態・時給を設定</li>
          <li>必要人員設定で各店舗の曜日×時間帯のシフト枠を定義</li>
          <li>毎週: シフト計画で希望シフトを入力 → 自動配置 → 微調整 → 公開</li>
          <li>毎日: 紙の打刻表を月末に勤怠ページへ転記 (or 計画から一括コピー)</li>
          <li>月末: 給与集計で CSV をダウンロード → 振込・給与明細作成へ</li>
        </ol>
      </div>
    </div>
  );
}
