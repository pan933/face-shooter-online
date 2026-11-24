# 登録用パスワードのサーバー保管設定

共通登録パスワードは Firebase Secret Manager に保存します。HTML / JavaScript / GitHub / Firestore には保存しません。

## 初回設定

1. Firebase CLI にログインし、リポジトリのルートで実行します。

```bash
firebase use face-61ed1
cd "顔面シューティング_GitHubPages版/functions"
npm install
cd ../..
firebase functions:secrets:set REGISTRATION_CODE
```

2. プロンプトが出たら、以前のコードとは異なる新しい共通登録パスワードを入力します。以前のコードは公開JSに含まれていたため、再利用しないでください。
3. 関数とFirestoreルールをデプロイします。

```bash
firebase deploy --only functions,firestore:rules
```

## 実装内容

- `registerAccount`: 共通コードをサーバーで照合し、Admin SDKでメール/パスワードアカウントを作成します。
- `finalizeXRegistration`: X初回ログイン後に共通コードを照合し、登録済みクレームを付与します。
- `activateExistingAccount`: 既存プロフィールのあるアカウントを確認し、登録済みクレームを付与します。
- Firestoreルールは `registered: true` のカスタムクレームがないユーザーを拒否します。
- コードの照合失敗はIP単位で10分5回までに制限します。
- 登録コード、ユーザーパスワードはログに記録しません。

## 料金

Cloud Functions のデプロイには通常 Blaze（従量課金）プランが必要です。Secret Manager には無料枠がありますが、Functions / Cloud Build / Artifact Registry などで料金が発生する可能性があります。デプロイ前にGoogle Cloudの予算アラートを設定してください。

デプロイ前に Firebase Authentication の Email/Password と Twitter(X) プロバイダが有効であることを確認してください。
