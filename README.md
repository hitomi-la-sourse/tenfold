# TENFOLD：王国の心理戦

10種類・18枚のカードで遊ぶ、2〜4人用の推理・心理戦型ブラウザゲームです。  
CPU対戦と、Socket.IOを使ったオンライン対戦（合言葉ルーム／2人クイック対戦）に対応します。無料・登録不要です。

> TENFOLDは独自の名称、文章、カード紋章、画面デザインで制作したオリジナル作品です。他社の公式画像、ロゴ、物語、文章、音楽、カードデザインは使用していません。特定作品の公式版、公認版、提携版ではありません。

## 主な機能

- 人間1人＋CPU 1〜3人。CPUは「かんたん」「ふつう」から選択
- 2〜4人の合言葉ルーム、空席へのCPU追加
- 2人用クイック対戦、待機キャンセル、CPU戦への切り替え案内
- 全10種類・18枚のカード効果、転生札、守護、賢者、少年の特殊処理
- プレイヤー別の秘匿ビュー、非公開情報の漏えい防止テスト
- 60秒の再接続猶予と、期限後のCPU自動交代
- ゲームログ、結果、再戦、退出、効果音設定
- PC／スマートフォン／タブレット対応、キーボード操作、軽減モーション対応

## 対応ブラウザ

現在の安定版および1つ前のメジャーバージョンの Chrome、Edge、Firefox、Safari を想定しています。WebSocket、Web Crypto API、`localStorage` が必要です。

## 技術構成

- Web: Next.js（App Router）、React、TypeScript strict、Tailwind CSS
- Server: Fastify、Socket.IO、Zod、pino、helmet、CORS、レート制限
- Core: 純粋TypeScriptのゲームエンジン、差し替え可能な安全な乱数源
- Test: Vitest、Playwright
- Repository: pnpm workspace

```text
apps/
  web/          Next.js UI
  server/       Fastify + Socket.IO
packages/
  game-engine/  ルール、手番、効果、勝敗、プレイヤー別ビュー
  shared/       通信型、Zodスキーマ
  bot/          公開情報だけを受け取るCPU
docs/
  architecture.md
  deployment.md
  security.md
e2e/
```

## ローカル起動

必要環境は Node.js 22以上と pnpm 11です。

```bash
cp .env.example .env
pnpm install
pnpm dev
```

- Web: <http://localhost:3000>
- ゲームサーバー: <http://localhost:3001>
- ヘルスチェック: <http://localhost:3001/health>

Windows PowerShellでは、必要なら `Copy-Item .env.example .env` を使ってください。開発時は `.env.example` の値のまま起動できます。

## コマンド

```bash
pnpm dev         # Webとサーバーを同時起動
pnpm lint        # 静的解析
pnpm typecheck   # 全ワークスペースの厳格な型検査
pnpm test        # ゲームエンジン単体・漏えい防止テスト
pnpm test:e2e    # CPU戦、オンライン2人戦、決着、再戦
pnpm build       # Webとサーバーの本番ビルド
```

初回のE2Eテスト前にブラウザがない場合は、`pnpm exec playwright install chromium` を一度実行してください。

## ゲームルール

1. 18枚をシャッフルし、各プレイヤーへ1枚配り、続く1枚を裏向きの転生札として封印します。
2. 手番では1枚引き、2枚から英雄以外の1枚を表向きで出します。
3. 対象・宣言・選択を行い、カード効果を解決します。効果で捨てられたカード自身の効果は発動しません。
4. 最後の生存者が勝利します。山札が尽きた場合は生存者の手札を公開し、最高ランクが勝利。同値は引き分けです。

全カードの説明はアプリ内の `/cards`、詳細な手番は `/rules` で確認できます。

## オンライン対戦

ゲームの完全な状態はサーバーだけが保持します。クライアントはカードIDや対象などの「希望する操作」だけを送り、サーバーが手番・カード・対象・二重送信を検証します。

各プレイヤーへは `createPlayerView(state, viewerPlayerId)` で生成した専用ビューだけを送ります。通常状態で他人の手札、山札順、転生札の中身、死神の伏せ札、他人の占師結果は送信しません。

### 再接続

- 推測困難な再接続トークンを端末の `localStorage` に保存
- 切断から60秒間は席を保持
- 同じトークンで本人用の最新状態へ復帰
- 60秒を超えるとCPUが引き継ぎ、元プレイヤーは復帰不可
- トークンはURL、公開ログ、サーバーログへ出しません

## 環境変数

| 変数                          | 既定値                  | 用途                         |
| ----------------------------- | ----------------------- | ---------------------------- |
| `NODE_ENV`                    | `development`           | 実行環境                     |
| `WEB_ORIGIN`                  | `http://localhost:3000` | Socket/CORSの許可元          |
| `GAME_SERVER_PORT`            | `3001`                  | ゲームサーバーのポート       |
| `NEXT_PUBLIC_GAME_SERVER_URL` | `http://localhost:3001` | ブラウザから接続するサーバー |
| `NEXT_PUBLIC_SITE_URL`        | `http://localhost:3000` | メタデータのサイトURL        |
| `ROOM_TTL_MINUTES`            | `60`                    | 未開始ルームの保持時間       |
| `FINISHED_ROOM_TTL_MINUTES`   | `30`                    | 終了ルームの保持時間         |
| `RECONNECT_GRACE_SECONDS`     | `60`                    | 再接続猶予                   |
| `LOG_LEVEL`                   | `info`                  | サーバーログレベル           |

## デプロイ

Webと常時接続可能なゲームサーバーを分離して配備します。詳しくは [docs/deployment.md](docs/deployment.md) を参照してください。

- Web: VercelなどのNext.js対応環境
- Server: Railway、Render、Fly.ioなど、WebSocketを維持できるNode.js環境
- 1サービス構成: `docker-compose.yml` を基にWeb・Serverを同じ基盤へ配置可能

本番では `NEXT_PUBLIC_GAME_SERVER_URL` をHTTPSサイトから到達できる `https://` のURLにし、Socket.IOがWSSへ昇格できるようにします。`WEB_ORIGIN` は公開Webの正確なオリジンだけを指定してください。

## セキュリティ方針

[docs/security.md](docs/security.md) に、サーバー主導、入力検証、秘匿ビュー、ログの秘匿、レート制限、ルーム削除方針を記載しています。

## 既知の制限

- MVPはインメモリの単一サーバー構成です。再起動で進行中ルームは消えます。
- 複数サーバー間の水平スケーリング、観戦、チャット、フレンド、ランキングはありません。
- オンライン再戦は、接続中の誰かが再戦を押すと同じ参加者ですぐ開始します。投票制は今後の拡張です。
- CPU「ふつう」は取得した透視情報と公開捨て札を利用しますが、完全探索AIではありません。

## 今後の拡張

- Redis製の `RoomRepository` とSocket.IOアダプター
- 定型リアクション
- 再戦投票、ルーム設定、観戦
- PWA通知、効果音テーマ、許諾済みテーマの差し替え
- CPUの推論モデル強化

課金、広告、ガチャ、NFT、暗号資産、賞金、ユーザー間チャットは実装しません。
