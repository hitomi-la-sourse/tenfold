export const metadata = { title: "プライバシー" };

export default function PrivacyPage() {
  return (
    <section className="page-shell prose-page">
      <div className="section-heading">
        <p className="eyebrow">PRIVACY</p>
        <h1>必要なものだけを、端末に。</h1>
      </div>
      <div className="glass-panel legal-copy">
        <h2>保存する情報</h2>
        <p>
          アカウント登録はありません。ブラウザにはニックネーム、効果音設定、チュートリアル確認状態、
          対戦中の再接続トークンを保存します。
        </p>
        <h2>ゲームサーバー</h2>
        <p>
          対戦中のルームとゲーム状態を一時的にメモリへ保持します。終了済みルームは30分以内、
          未開始の放置ルームは60分以内に削除します。手札や再接続トークンをログへ記録しません。
        </p>
        <h2>権利表記</h2>
        <p>
          TENFOLDは独自の名称・文章・カード紋章・画面デザインで制作したオリジナル作品です。
          他社の公式素材、ロゴ、物語、音楽、カード画像は使用していません。特定作品の公式版、
          公認版、提携版ではありません。
        </p>
      </div>
    </section>
  );
}
