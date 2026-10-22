# 顔面シューティング — GitHub Pages 静的版

Node.jsサーバーなしで動かすための、GitHub Pages向け静的サイト一式です。HTML・CSS・ブラウザー内JavaScriptだけで動きます。

## 重要な制限

GitHub Pagesは静的ファイルのホスティングなので、サーバー側の認証や共有データベースはありません。

- ログインIDとパスワードのハッシュは、登録したブラウザーの `localStorage` に保存します。
- ランキングも同じブラウザーの `localStorage` に保存します。別端末や別ブラウザーとは共有されません。
- 「komakikouka」はブラウザー側JavaScriptで照合する登録コードです。公開コードから確認できるため、秘密のアクセス制限としては使えません。
- Xログインはこの静的版では無効です。X OAuthを安全に行うためのサーバー側処理がないためです。
- このログインは学習・試作用です。個人で普段使っているパスワードを登録しないでください。

本当に複数人でランキングを共有し、他人に見えない認証を行うには、Node.jsサーバーを自分で運用しなくても、Supabase/Firebaseのような外部バックエンドを使う必要があります。GitHub Pages単独では実現できません。

## GitHub Pagesで無料公開する手順

1. ZIPを展開し、中のファイルとフォルダーをリポジトリの**直下**にアップロードします。`index.html`、`game.html`、`login.html`、`face.png` が直下にあることを確認してください。
2. GitHubで公開リポジトリを作成し、ファイルを `main` ブランチへコミットします。GitHub Freeでは公開リポジトリでGitHub Pagesを利用できます。
3. リポジトリの **Settings → Pages** を開き、**Build and deployment → Source** を `GitHub Actions` にします。
4. **Actions** タブで `Deploy static game to GitHub Pages` ワークフローが成功したことを確認します。
5. Settings → Pagesに表示されたURLを開きます。初回公開に少し時間がかかる場合があります。

このリポジトリには `.github/workflows/pages.yml` が含まれ、`main` に更新をpushすると自動デプロイします。

## ファイル構成

- `index.html` / `login.html`: ログイン・新規登録画面
- `game.html`: ゲーム本体
- `css/auth.css`: 認証画面のスタイル
- `css/game.css`: ゲーム画面のスタイル
- `js/login.js`: ブラウザー内での簡易登録・ログイン
- `js/game.js`: ゲーム・ブラウザー内ランキング
- `face.png`: 顔画像
- `.github/workflows/pages.yml`: GitHub Pages自動公開

## データについて

データはブラウザーのサイトデータに保存されます。ブラウザーのデータ消去、別端末、プライベートモードでは、登録・記録を引き継げない場合があります。パスワードを忘れた場合のサーバー側リセット機能はありません。
