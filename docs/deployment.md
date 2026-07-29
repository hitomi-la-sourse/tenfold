# デプロイ手順

## 推奨構成

WebはVercelなどのNext.js対応基盤、ゲームサーバーはRailway、Render、Fly.ioなどの常時接続可能なNode.js基盤へ分離します。

1. ゲームサーバーを `Dockerfile.server` で配備し、`/health` が200を返すことを確認
2. サーバーの公開HTTPS URLをWeb側の `NEXT_PUBLIC_GAME_SERVER_URL` へ設定
3. Webを `Dockerfile.web` またはVercelで配備
4. Webの公開オリジンをサーバー側の `WEB_ORIGIN` へ設定して再起動
5. 2つのブラウザコンテキストでルーム参加とWSS接続を確認

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

## Docker Compose

ローカルで本番相当の2サービスを確認できます。

```bash
docker compose up --build
```

ブラウザから <http://localhost:3000> を開きます。

## 注意

- 無料サーバーがスリープすると、初回接続が遅れたり進行中ルームが失われたりします。
- リバースプロキシでHTTP Upgradeを許可し、WebSocketのidle timeoutを十分長くします。
- サーバーはインメモリのため、ローリング更新や複数インスタンスはルームを分断します。水平化前にRedis repositoryとSocket.IO Redis adapterを導入してください。
