import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto max-w-3xl px-4 py-8 text-gray-800">
        <h1 className="mb-6 text-2xl font-bold border-b-2 border-orange-500 pb-2">
          プライバシーポリシー
        </h1>

        <p className="mb-6 text-sm leading-relaxed">
          株式会社Demo Foods Inc.（以下「当社」といいます）は、Demo Restaurant（Shop A・Shop B、以下「当店」といいます）が運営する LINE 公式アカウント及び関連サービス（スタンプカード・クーポン配布等、以下総称して「本サービス」といいます）における、お客様の個人情報の取扱いについて、以下のとおりプライバシーポリシーを定めます。
        </p>

        <Section title="1. 事業者情報">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-600">事業者名：</dt><dd>株式会社Demo Foods Inc.</dd>
            <dt className="text-gray-600">屋号：</dt><dd>Demo Restaurant</dd>
            <dt className="text-gray-600">お問い合わせ：</dt><dd>各店舗（下記）</dd>
          </dl>
        </Section>

        <Section title="2. 取得する情報">
          <p className="text-sm mb-2">本サービスの提供にあたり、以下の情報を取得します。</p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>LINE ユーザー識別子（LINE UID）</li>
            <li>LINE プロフィール情報（表示名、プロフィール画像）</li>
            <li>来店履歴（日時・店舗）</li>
            <li>スタンプ・クーポンの発行・使用履歴</li>
            <li>お客様から送信いただいたメッセージ</li>
            <li>予約情報（予約された場合のお名前・電話番号・人数等）</li>
          </ul>
        </Section>

        <Section title="3. 利用目的">
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>本サービスの提供・運営</li>
            <li>スタンプ・クーポンの発行、管理、特典の提供</li>
            <li>お客様へのお知らせ・キャンペーン情報の配信</li>
            <li>予約管理</li>
            <li>お問い合わせへの対応</li>
            <li>利用状況の分析による、サービス改善</li>
            <li>法令に基づく対応</li>
          </ul>
        </Section>

        <Section title="4. 第三者提供">
          <p className="text-sm">
            当社は、お客様の個人情報を、以下の場合を除き、お客様の同意なく第三者に提供しません。
          </p>
          <ul className="list-disc pl-6 text-sm space-y-1 mt-2">
            <li>法令に基づく場合</li>
            <li>人の生命、身体又は財産の保護のために必要がある場合</li>
            <li>公衆衛生の向上又は児童の健全な育成の推進のために特に必要がある場合</li>
            <li>国の機関若しくは地方公共団体又はその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合</li>
          </ul>
        </Section>

        <Section title="5. 業務委託先">
          <p className="text-sm mb-2">
            本サービスの運営にあたり、以下の業務委託先に個人情報の取扱いを委託することがあります。委託先に対しては、個人情報を適切に管理するよう必要な監督を行います。
          </p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>Centaurus（代表：猪野 凌） — システム開発・保守運用</li>
            <li>Supabase Inc. — データベース基盤</li>
            <li>Vercel Inc. — アプリケーションホスティング</li>
            <li>LINE ヤフー株式会社 — メッセージング基盤</li>
          </ul>
        </Section>

        <Section title="6. 個人情報の保管期間">
          <p className="text-sm">
            当社は、利用目的の達成に必要な範囲において個人情報を保管します。お客様が本サービスの利用を停止された場合（LINE 公式アカウントのブロック等）、法令に定める保存期間を除き、合理的な期間内に削除します。
          </p>
        </Section>

        <Section title="7. 開示・訂正・削除のご請求">
          <p className="text-sm">
            お客様はご自身の個人情報について、開示・訂正・利用停止・削除をご請求いただけます。請求方法は以下のとおりです。
          </p>
          <ul className="list-disc pl-6 text-sm space-y-1 mt-2">
            <li>各店舗までご連絡ください</li>
            <li>本人確認の上、合理的な期間内に対応いたします</li>
          </ul>
        </Section>

        <Section title="8. 改定">
          <p className="text-sm">
            本ポリシーは、法令改正やサービス改善のため、予告なく変更することがあります。変更後の本ポリシーは、本ページに掲載された時点から効力を生じます。
          </p>
        </Section>

        <Section title="9. お問い合わせ窓口">
          <p className="text-sm">
            本ポリシー及び個人情報の取扱いに関するお問い合わせは、各店舗までお願いいたします。
          </p>
        </Section>

        <p className="mt-8 text-right text-xs text-gray-500">
          制定日：2026年4月25日
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-lg font-bold text-orange-700">{title}</h2>
      <div className="text-gray-700">{children}</div>
    </section>
  );
}
