# セキュリティ設定

## 1. 新規登録コードをサーバー側の Secret に設定する

新規登録コードは以前の公開JavaScriptに含まれていたため、**以前と同じコードは使わず、新しいコードに変更してください**。Gitの過去の履歴からも以前の値を確認できる可能性があります。

Firebase CLIで対象プロジェクトにログインし、FunctionsをデプロイできるFirebaseプロジェクトの設定ディレクトリで実行します。

```bash
firebase functions:secrets:set REGISTRATION_CODE
```

入力を求められたら、新しい登録コードを入力します。値をソースコードやGitHubへ貼り付けないでください。

その後、Functionsをデプロイします。

```bash
firebase deploy --only functions
```

このリポジトリのFunctionsコードは `顔面シューティング_GitHubPages版/functions` にあります。Firebase CLIの設定で、このフォルダがFunctionsのsourceとして指定されていることを確認してください。

デプロイされる関数:
- `registerAccount`: 登録コードをサーバー側で確認してFirebase Authenticationにアカウントを作成
- `verifyXRegistrationCode`: Xログイン初回登録のコードをサーバー側で確認

ユーザーのパスワードはFirebase Authenticationへ渡され、FirestoreやGitHubのソースコードには保存しません。Functions側でもパスワードをログ出力しません。

## 2. 顔写真URLをFirestoreで管理する

顔写真URLはJavaScriptの定数ではなく、Firestoreの `adminSettings/gameplay` ドキュメント内にある `gachaFaces` の各顔データの `imageUrl` として管理します。

1. 管理者アカウントでゲームの管理ページを開く
2. ガチャ顔管理で各顔の画像URLを入力する
3. 保存する

既にFirestoreに `gachaFaces` が保存されている場合、そのデータをそのまま読み込みます。未設定の場合は、管理画面に初期の顔データだけが表示されるため、画像URLを入力して保存してください。

**注意:** 顔写真URLは画面表示のためにブラウザへ渡す必要があるため、Firestoreへ移しても閲覧者から完全に隠せるわけではありません。これはソースコードへURLを直書きしないための変更です。非公開画像にしたい場合は、Cloud Storageの認証付きアクセスなど別の仕組みが必要です。

## 3. 管理者デバッグ

ゲーム内の管理者デバッグは、固定パスワードではなくFirestoreの `admins/{UID}` にある `role` が `owner` または `admin` のユーザーだけに表示します。

## 4. Firebase Web APIキーについて

`js/firebase-config.js` のFirebase Web APIキーやプロジェクトIDは、Webアプリの初期化に使う公開設定値です。パスワードやサービスアカウント秘密鍵とは異なります。Firestore Rules、Authenticationの承認済みドメイン、必要に応じたAPIキー制限で保護してください。
