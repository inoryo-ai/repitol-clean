import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "利用規約",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto max-w-3xl px-4 py-8 text-gray-800">
        <h1 className="mb-6 text-2xl font-bold border-b-2 border-orange-500 pb-2">
          利用規約
        </h1>

        <p className="mb-6 text-sm leading-relaxed">
          本利用規約（以下「本規約」といいます）は、株式会社Demo Foods Inc.（以下「当社」といいます）が運営するDemo Restaurant（Shop A・Shop B、以下「当店」といいます）の LINE 公式アカウント及び関連サービス（スタンプカード・クーポン配布等、以下総称して「本サービス」といいます）の利用条件を定めるものです。
        </p>

        <Section title="第1条（適用）">
          <p className="text-sm">
            本規約は、本サービスをご利用になる全てのお客様（以下「利用者」といいます）に適用されます。本サービスをご利用になった時点で、本規約に同意したものとみなします。
          </p>
        </Section>

        <Section title="第2条（サービス内容）">
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>ご来店時の QR コード読み取りによるスタンプ獲得</li>
            <li>スタンプ獲得に応じた特典クーポンの発行</li>
            <li>友だち追加時や毎月のクーポン配信</li>
            <li>当店からのお知らせ配信</li>
            <li>予約受付</li>
          </ul>
        </Section>

        <Section title="第3条（スタンプ・クーポンに関するルール）">
          <ol className="list-decimal pl-6 text-sm space-y-1">
            <li>スタンプは、1,000円以上のお会計時に1回付与されます（運用により変更される場合があります）。</li>
            <li>スタンプは、所定の個数に達した時点で特典クーポンが自動発行されます。</li>
            <li>クーポンは、記載の有効期限内に限り、当店店舗でのみご利用いただけます。</li>
            <li>他のクーポン・割引との併用可否は、クーポンごとの表示に従います。</li>
            <li>クーポンは、換金、譲渡、転売することはできません。</li>
            <li>クーポンの「使用する」ボタンを押した時点で使用済みとなり、取り消しはできません。必ず従業員の目の前で操作してください。</li>
            <li>予告なくスタンプ・クーポン制度の内容を変更する場合があります。</li>
          </ol>
        </Section>

        <Section title="第4条（禁止事項）">
          <p className="text-sm mb-2">利用者は、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>法令又は公序良俗に違反する行為</li>
            <li>犯罪行為に関連する行為</li>
            <li>当社、他の利用者、その他第三者の知的財産権、肖像権、プライバシー、名誉その他の権利又は利益を侵害する行為</li>
            <li>QR コードを無断で撮影・複製し、本人以外の LINE アカウントで不正にスタンプを獲得する行為</li>
            <li>来店事実がないにもかかわらずスタンプを獲得する行為</li>
            <li>本サービスの運営を妨害する行為</li>
            <li>不正アクセス、リバースエンジニアリング等の行為</li>
            <li>その他、当社が不適切と判断する行為</li>
          </ul>
        </Section>

        <Section title="第5条（利用停止・解除）">
          <p className="text-sm">
            当社は、利用者が本規約に違反した場合、予告なく当該利用者に対し本サービスの提供を停止し、又は当店の LINE 公式アカウントからブロックすることができます。その場合、当該利用者のスタンプ・クーポンは失効します。
          </p>
        </Section>

        <Section title="第6条（サービスの変更・中断・終了）">
          <p className="text-sm">
            当社は、利用者への事前の通知なく、本サービスの内容を変更し、又は提供を中断若しくは終了することができます。これにより利用者に生じた損害について、当社は責任を負いません。
          </p>
        </Section>

        <Section title="第7条（免責事項）">
          <ol className="list-decimal pl-6 text-sm space-y-1">
            <li>当社は、本サービスに関して、正確性、完全性、有用性、特定の目的への適合性等について、いかなる保証も行いません。</li>
            <li>通信環境、端末の不具合、LINE のシステム障害等により、本サービスをご利用いただけない場合があります。</li>
            <li>当社の故意又は重大な過失による場合を除き、当社は利用者に生じた損害について責任を負いません。</li>
          </ol>
        </Section>

        <Section title="第8条（準拠法・管轄）">
          <p className="text-sm">
            本規約の解釈及び本サービスに関する紛争については、日本法を準拠法とし、千葉地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>
        </Section>

        <Section title="第9条（規約の変更）">
          <p className="text-sm">
            当社は、必要と判断した場合、本規約を変更することができます。変更後の規約は、本ページに掲載された時点から効力を生じます。
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
