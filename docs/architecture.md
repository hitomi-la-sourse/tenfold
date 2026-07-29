# アーキテクチャ

## 状態の流れ

```text
人間UI / CPU
    │ 希望する操作（カードID・対象・宣言）
    ▼
共有Zodスキーマ
    ▼
Fastify + Socket.IO
    ▼
applyCommand(state, command)
    │
    ├─ 合法性・手番・二重送信の検証
    ├─ カード効果・脱落・転生・勝敗
    └─ サーバー内部の完全状態
              │
              ▼
createPlayerView(state, viewerPlayerId)
              │
              └─ プレイヤー固有の安全なpayload
```

`packages/game-engine` はUI、Socket.IO、Fastifyに依存しません。乱数は `RandomSource` として注入し、テストではseed固定、実行時はWeb Crypto APIを使います。

CPUは完全状態を受け取りません。本人用 `PlayerGameView` と `listLegalCommands` だけを受け取り、人間と同じコマンドAPIへ操作を返します。

## 保留アクション

対象、兵士の宣言、公開処刑、死神、賢者は `PendingAction` の判別共用体で表現します。保留中の選択権限は `actorId` でサーバー検証します。

## 永続化境界

`RoomRepository` は `create`、`findByCode`、`save`、`delete`、`all` を提供します。MVPはインメモリ実装ですが、ゲームサービスは実装詳細へ依存しないためRedisへ置換できます。

## テーマ境界

ルールは `CardType` とランクで処理します。表示名、効果名、説明、配色、紋章はカードマスターとUI層にあり、許諾済みテーマへ差し替えても判定ロジックは変わりません。
