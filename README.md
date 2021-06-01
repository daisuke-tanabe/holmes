# holmes

作業の効率化用CLIツールです。

初めての人はREADMEを一読するのを推奨。

## Usage

1. Gitlabのアクセストークンを生成する
2. `holmes.config.example.json` を `holmes.config.json` にリネームコピーする
3. `holmes.config.json` を書きかえる
    1. `gitlab.token` の値を `1` で生成したトークンに変更
    2. `gitlab.projects` の値を必要な分だけ記載する（README下部のNotesからプロジェクト対応表を確認）
    3. `gitlab.domain` は必要なら書きかえる
4. `npm run build` で `dist` ディレクトリを出力する
4. `npm link` でインストールとシンボリックリンクの作成を行う
5. `holmes help` で正常にインストールされているか確認する
    1. 正常に動かない場合は README下部のFAQを確認してください

## コマンド説明

コマンドの説明とちょっとした仕様について説明

### gitlab

Gitlabのリポジトリ情報の表示及び操作を行う。
手軽にブランチの削除が行えてしまうため、削除されたくないブランチは保護する必要があります。

```
// 結果をコピーする（削除モードでは無効）
$ holmes gitlab --copy

// マージ済みのブランチを表示する
$ holmes gitlab --merged

// マージされていないブランチを表示する
$ holmes gitlab --unmerged

// ブランチの削除を行う
$ holmes gitlab --remove

// 結果をコンソールに表示しない（削除モードでは無効）
$ holmes gitlab --silent
```

## FAQ

### 拡張方法について

一応こんな感じで考えています。

```
src
 ├ command
 │    ├ gitlab ← サブコマンド名
 │    │    ├ Gitlab.ts  ← クラスならアッパーキャメル
 │    │    └ index.ts   ← yargsの枠組みとクラスや関数のimportをする
 │    └ hoge
 │         ├ hoge.ts
 │         └ index.ts
 └ utility ← コマンド問わず使う関数やクラス
      ├ Fetch.ts ← 静的メソッドしか持たないクラス
      ├ piyo.ts  ← 関数でもよい 
      └ Hoga.ts  ← クラスならアッパーキャメル
```

### `command not found` になってしまう。

パスが通ってないかもしれないので確認しましょう。

### 新しいコマンドを作る

既存の作りを参考にすればよいと思います。
プロキシ環境では外部APIを利用する場合、`curl` コマンドを使わないとレスポンスが返ってこない可能性があります。

### `holmes.config.example.json` と `holmes.config.json` に分けられている意味

トークンを記入するのと個人で設定を変更する場合があるかもしれないためです。

## Memo

### プロジェクト情報の取得

自分の関わっているプロジェクトの情報が取得できる `curl` コマンドです。

```
// プロジェクト一覧の取得
curl -k --header 'PRIVATE-TOKEN: <YOUR_ACCESS_TOKEN>' https://<GITLAB_DOMAIN>/api/v4/projects

// グループに紐付いているプロジェクトを取得
curl -k --header 'PRIVATE-TOKEN: <YOUR_ACCESS_TOKEN>' https://<GITLAB_DOMAIN>/api/v4/groups
```s
