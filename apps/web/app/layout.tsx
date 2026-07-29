import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://tenfold-card-game.leafy-knoll-5739.chatgpt.site",
  ),
  title: {
    default: "TENFOLD｜王国の心理戦",
    template: "%s｜TENFOLD",
  },
  description: "10の力が交錯する、2～4人用の推理・心理戦カードゲーム。",
  openGraph: {
    title: "TENFOLD｜王国の心理戦",
    description: "無料・登録不要。CPU戦とオンライン対戦に対応。",
    type: "website",
    locale: "ja_JP",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TENFOLD 王国の心理戦" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TENFOLD｜王国の心理戦",
    description: "無料・登録不要。CPU戦とオンライン対戦に対応。",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b18",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <a className="skip-link" href="#main">
          本文へ移動
        </a>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="TENFOLD トップへ">
            <span className="brand-mark" aria-hidden="true">
              X
            </span>
            <span>
              <strong>TENFOLD</strong>
              <small>王国の心理戦</small>
            </span>
          </Link>
          <nav aria-label="メインナビゲーション">
            <Link href="/play">対戦</Link>
            <Link href="/rules">遊び方</Link>
            <Link href="/cards">カード</Link>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <span>TENFOLD — an original card game</span>
          <div>
            <Link href="/privacy">プライバシー</Link>
            <Link href="/rules">ルール</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
