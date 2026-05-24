import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
};

export default function TokuteiPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto max-w-3xl px-4 py-8 text-gray-800">
        <h1 className="mb-6 text-2xl font-bold border-b-2 border-orange-500 pb-2">
          特定商取引法に基づく表記
        </h1>

        <p className="mb-6 text-sm leading-relaxed">
          本ページは、当店が運営する LINE 公式アカウント及びスタンプカード・クーポンサービスに関する特定商取引法に基づく事業者情報を記載するものです。なお、本サービスで配布されるクーポンは、ご来店時の無償の特典提供を目的としたものであり、物品の販売や金銭の直接的な授受を伴うものではありません。
        </p>

        <div className="rounded-xl bg-white p-6 shadow-md space-y-4">
          <Row label="販売業者">株式会社Demo Foods Inc.</Row>
          <Row label="運営責任者">（代表取締役氏名）</Row>
          <Row label="屋号">Demo Restaurant</Row>
          <Row label="所在地">（本店所在地）</Row>
          <Row label="電話番号">（お問い合わせ可能な電話番号）<br /><span className="text-xs text-gray-500">※営業時間内に限ります</span></Row>
          <Row label="メールアドレス">（お問い合わせ用メールアドレス）</Row>
          <Row label="営業時間">各店舗の営業時間に準じます</Row>
          <Row label="販売価格">
            本サービスでは物品の直接販売は行っておりません。<br />
            店舗における飲食メニューの価格は、店頭の価格表をご確認ください。
          </Row>
          <Row label="支払方法">店舗における会計時の現金・クレジットカード・電子マネー等に準じます</Row>
          <Row label="商品代金以外の必要料金">
            通信費：本サービスのご利用にかかる通信料金はお客様のご負担となります
          </Row>
          <Row label="引渡時期">クーポンは発行時に LINE 公式アカウント経由で即時発行されます</Row>
          <Row label="返品・交換">
            クーポンの性質上、発行後の返品・交換・払戻しには応じかねます。<br />
            使用後の取り消しもできません。ご了承ください。
          </Row>
        </div>

        <p className="mt-8 text-xs text-gray-500 leading-relaxed">
          ※（　）内の項目は、事業者情報の登録完了後に正式な内容に差し替えられます。<br />
          ※本表記は、利用者のご要望に応じて遅滞なく詳細を開示いたします。
        </p>

        <p className="mt-4 text-right text-xs text-gray-500">
          制定日：2026年4月25日
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-4 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
      <dt className="text-sm font-bold text-orange-700">{label}</dt>
      <dd className="text-sm text-gray-700 leading-relaxed">{children}</dd>
    </div>
  );
}
