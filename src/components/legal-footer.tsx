import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="mt-auto py-4 text-center text-xs text-gray-400">
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link href="/privacy" className="hover:text-gray-600 underline underline-offset-2">
          プライバシーポリシー
        </Link>
        <span>|</span>
        <Link href="/terms" className="hover:text-gray-600 underline underline-offset-2">
          利用規約
        </Link>
        <span>|</span>
        <Link href="/tokutei" className="hover:text-gray-600 underline underline-offset-2">
          特商法表記
        </Link>
      </div>
      <p className="mt-2">Powered by リピトル</p>
    </footer>
  );
}
