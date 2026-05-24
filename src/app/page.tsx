import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔁</span>
            <span className="text-xl font-bold">リピトル</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/login"><Button variant="ghost" size="sm">ログイン</Button></Link>
            <Link href="/signup"><Button size="sm">無料で始める</Button></Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-24 text-center">
          <Badge variant="secondary" className="mb-6">飲食店専用 × LINE連携 × 月額980円〜</Badge>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            常連さんが増える。<br />
            <span className="text-primary">LINEで「また来たい」を作る。</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground">
            LINE公式アカウントと連携するだけ。<br />
            顧客管理・クーポン自動配信・スタンプカード・予約リマインドが月額980円から。
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/signup"><Button size="lg" className="text-base">無料で始める</Button></Link>
            <Link href="#features"><Button variant="outline" size="lg" className="text-base">機能を見る</Button></Link>
          </div>
        </section>

        <section id="features" className="border-t bg-muted/30 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="mb-12 text-center text-3xl font-bold">リピーターが増える4つの仕組み</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card><CardContent className="pt-6">
                <div className="mb-4 text-4xl">👥</div>
                <h3 className="mb-2 text-lg font-semibold">顧客管理</h3>
                <p className="text-sm text-muted-foreground">LINE友だち追加で自動登録。来店回数・最終来店日が一目でわかる。</p>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="mb-4 text-4xl">🎫</div>
                <h3 className="mb-2 text-lg font-semibold">クーポン配信</h3>
                <p className="text-sm text-muted-foreground">来店N回目で自動配信。常連には特別クーポン。使い忘れ防止のリマインドも。</p>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="mb-4 text-4xl">⭐</div>
                <h3 className="mb-2 text-lg font-semibold">スタンプカード</h3>
                <p className="text-sm text-muted-foreground">紙のスタンプカードをLINEに。貯まったら特典クーポンが自動発行。</p>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <div className="mb-4 text-4xl">📅</div>
                <h3 className="mb-2 text-lg font-semibold">予約リマインド</h3>
                <p className="text-sm text-muted-foreground">予約前日にLINEで自動リマインド。ノーショーを減らす。</p>
              </CardContent></Card>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="mb-12 text-center text-3xl font-bold">料金プラン</h2>
            <div className="grid gap-6 md:grid-cols-3">
              <Card><CardContent className="pt-6">
                <h3 className="text-lg font-semibold">スターター</h3>
                <div className="my-4"><span className="text-4xl font-bold">980</span><span className="text-muted-foreground">円/月</span></div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>顧客100名まで</li>
                  <li>LINE配信 月200通</li>
                  <li>スタンプカード 1種</li>
                  <li>予約管理</li>
                  <li>クーポン配信</li>
                </ul>
              </CardContent></Card>
              <Card className="border-primary"><CardContent className="pt-6">
                <Badge className="mb-2">おすすめ</Badge>
                <h3 className="text-lg font-semibold">スタンダード</h3>
                <div className="my-4"><span className="text-4xl font-bold">1,980</span><span className="text-muted-foreground">円/月</span></div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>顧客500名まで</li>
                  <li>LINE配信 月1,000通</li>
                  <li>スタンプカード 3種</li>
                  <li>セグメント配信</li>
                  <li>自動配信トリガー</li>
                  <li>配信数モニタリング</li>
                </ul>
              </CardContent></Card>
              <Card><CardContent className="pt-6">
                <h3 className="text-lg font-semibold">プロ</h3>
                <div className="my-4"><span className="text-4xl font-bold">4,980</span><span className="text-muted-foreground">円/月</span></div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>顧客無制限</li>
                  <li>LINE配信 無制限</li>
                  <li>スタンプカード 無制限</li>
                  <li>全機能利用可能</li>
                  <li>優先サポート</li>
                </ul>
              </CardContent></Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-muted-foreground">
          <p>&copy; 2026 リピトル by Centaurus. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
