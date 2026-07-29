# デプロイ手順

## 公開版

Sites上でNext.js UI、Cloudflare Worker互換API、D1ルームストレージを一体配備します。オンライン対戦はHTTPSの短いポーリングで同期し、P2P、STUN、TURN、WebSocketに依存しません。

1. `apps/web/.openai/hosting.json` でD1の論理バインディング `DB` を宣言
2. `pnpm --filter @tenfold/web db:generate` でマイグレーションを生成
3. `pnpm --filter @tenfold/web build:sites` で公開用ビルド
4. Sitesへ保存・配備し、2つの独立したネットワークからルーム参加を確認

## 本番環境変数

```env
NODE_ENV=production
WEB_ORIGIN=https://your-web.example
GAME_SERVER_PORT=3001
NEXT_PUBLIC_GAME_SERVER_URL=https://your-game-server.example
NEXT_PUBLIC_SITE_URL=https://your-web.example
ROOM_TTL_MINUTES=60
FINISHED_ROOM_TTL_MINUTES=30
RECONNECT_GRACE_SECONDS=60
LOG_LEVEL=info
```

## セルフホスト版

ローカルで本番相当の2サービスを確認できます。

```bash
docker compose up --build
```

ブラウザから <http://localhost:3000> を開きます。

`apps/server` のSocket.IO版を使う場合は、従来どおりWebSocket対応のNode.js基盤へ配備できます。

## 注意

- 公開版ルームは最終操作から24時間後に期限切れになります。
- D1更新はバージョン番号による楽観ロックを使い、同時操作を上書きしません。
- セルフホスト版はインメモリのため、水平化前にRedis repositoryとSocket.IO Redis adapterが必要です。
