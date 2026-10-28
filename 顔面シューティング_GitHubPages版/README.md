# 顔面シューティング — Firebase共有版（GitHub Pages / Node.js不要）

この版は、ゲーム画面をGitHub Pagesで公開し、アカウント認証と共通ランキングをFirebase Authentication / Cloud Firestoreで管理します。Node.jsサーバーを自分で起動する必要はありません。

## できること

- ID＋パスワードで新規登録・ログイン
- 同じIDとパスワードなら別のPC・スマホでも同じアカウントにログイン
- ランキングを全プレイヤーで共有（各ユーザーの自己ベストをTOP 10表示）
- Xログイン（FirebaseのTwitterプロバイダとX Developerアプリの設定が完了した場合）
- ランキングデータはFirestoreへ保存

## 重要な仕様と限界

- IDは半角英字・数字・`_`・`-` の2〜24文字です。
- IDログインをメールアドレスなしで実現するため、Firebase Authentication内部では `ID@face-shooter.invalid` という受信できない形式のアドレスを使います。メールを集めませんが、パスワード再設定メールも送れません。IDとパスワードは忘れないようにしてください。
- 新規登録用コード `komakikouka` はフロントエンドJavaScriptに入っています。ソースを見れば分かるため、秘密の招待制にはなりません。登録コードを本当に秘密にするにはサーバー側機能が必要です。
- ブラウザーだけで送信するスコアのため、改造したクライアントからの不正スコアを完全には防げません。Firestoreルールで、本人のレコード以外を書き換えられないようにし、自己ベストを下げる更新と極端な値を拒否します。
- 以前のlocalStorage版のアカウントやランキングはクラウドへ自動移行されません。Firebase共有版で新規アカウントを作成してください。
- Xログインは任意機能です。X Developerアプリの認証情報がない間は利用できません。

## 1. Firebaseプロジェクトを作る（無料枠）

1. https://console.firebase.google.com/ を開き、Googleアカウントでログインします。
2. **プロジェクトを作成**し、Google Analyticsは不要なら無効にして進めます。
3. 左側の **Build → Authentication** を開き、**Get started** を押します。
4. Sign-in method / Sign-in providers で **Email/Password** を有効にして保存します。ここでいうメール/パスワード方式を、サイト側ではID＋パスワードの形にしています。
5. Authenticationの設定にある **Authorized domains** に `pan933.github.io` があるか確認します。なければ追加します。
6. **Build → Firestore Database → Create database** を開き、データベースを作成します。リージョンは日本から使うなら `asia-northeast1`（Tokyo）が候補です。リージョンは後から変更できないため確認してから作成してください。
7. Firestoreの **Rules** タブに、同梱の `firestore.rules` を貼り付けて **Publish** します。このファイルには、このゲームで使うログイン・プロフィール・ゲームデータ・ランキング・管理画面・PvP用ルールをまとめています。Firebaseプロジェクトでこのゲーム以外のアプリも動かしている場合は、そのアプリのルールも残るよう統合してください。

### 管理画面の初期 owner 設定

最初の管理者は、Firestore Rules公開後にFirebase Consoleから登録します。Authenticationのユーザー一覧で自分のUIDを確認し、Firestoreの `admins` コレクションにドキュメントIDをそのUIDにしたドキュメントを作成してください。フィールドは `role`（文字列）=`owner`、`createdAt`（timestamp）=現在時刻です。以降の管理者追加はゲーム内管理画面から行えます。owner登録をクライアントから許すルールにはしていません。

### フレンド対戦を有効にする

ゲーム画面の「フレンドとオンライン対戦」から8文字の合言葉を発行し、フレンドが同じ画面で入力すると、別モードの1対1直接攻撃PvPが始まります。装備中の顔画像を同期し、敵やボスのいないアリーナで相手を撃ち、左右移動で弾を避けます。両方のプレイヤーがログインしている必要があります。一人用の出撃ボタンとランキングは別モードのままです。

この機能はFirestoreに `pvpRooms` を作成し、プレイヤーの位置と弾の命中イベントを同期します。上記の統合済み `firestore.rules` をFirebase Consoleの **Firestore Database → Rules** に公開してください。GitHubへのプッシュだけではFirebaseのルールは更新されません。

## 2. FirebaseのWeb設定をHTMLに入れる

1. Firebase Consoleの歯車 **Project settings → General → Your apps** を開きます。
2. Webアプリ（`</>`）がなければ追加します。
3. Firebase SDK設定から `apiKey`、`authDomain`、`projectId`、`appId` をコピーします。
4. `js/firebase-config.js` を開き、値を置き換えます。

```js
const firebaseConfig = {
  apiKey: "FirebaseのapiKey",
  authDomain: "プロジェクトID.firebaseapp.com",
  projectId: "プロジェクトID",
  appId: "FirebaseのappId"
};
```

**Web設定のapiKeyはブラウザーへ公開される値です。** FirebaseのセキュリティはFirestore RulesとAuthenticationで設定します。サービスアカウントJSON、Admin SDKの秘密鍵、秘密トークンは絶対にこのフォルダへ入れないでください。

## 3. GitHubへ更新ファイルをアップロード

このリポジトリではサイトが `顔面シューティング_GitHubPages版` フォルダにあります。ZIP内の同じフォルダにある更新ファイルを、GitHub上の同名フォルダ内へ上書きアップロードします。少なくとも次のファイルを反映してください。

- `index.html`
- `login.html`
- `game.html`
- `js/login.js`
- `js/game.js`
- `js/firebase-config.js`（新規）
- `css/auth.css`（必要なら同梱版で上書き）

GitHubで **Commit changes** したあと、リポジトリの **Actions** タブでPagesデプロイが緑色になるのを待ちます。

## 4. 動作確認

1. 公開URLを開き、新規登録タブでID・パスワード・登録コード `komakikouka` を入力します。
2. ゲームを開始し、スコアを獲得してゲームオーバーまたは途中終了までプレイします。
3. タイトル画面のランキングに自己ベストが追加されることを確認します。
4. 別ブラウザーまたはスマホで同じID・パスワードを入力し、同じランキングが見えるか確認します。

## 5. Xログイン（任意）

1. Firebase AuthenticationのSign-in providersで **Twitter** を有効にします。
2. Firebaseが表示するコールバックURL（一般的には `https://<project-id>.firebaseapp.com/__/auth/handler`）をコピーします。
3. X Developerアプリの認証設定に、FirebaseのAPI key/secretとコールバックURLを登録します。
4. Firebase ConsoleでTwitter providerを有効化し、X側のキーとシークレットを保存します。
5. GitHub Pagesの `login.html` から **Xでログイン / 新規登録** を試します。

X Developer側の利用条件やアプリ設定はX側の管理画面で確認してください。FirebaseのWeb設定だけではXログインは有効になりません。

## 無料枠について

Firebase Authentication（Email/Password等）とCloud Firestoreは無料枠から始められます。ただし無料枠には読み書き回数・保存容量などの上限があり、超過・仕様変更時には利用制限が発生し得ます。利用量をFirebase Consoleで確認してください。無料枠に限定する場合は、プロジェクトを有料課金プランへ切り替えず、使用量を定期的に確認します。

公式資料：
- Firebase料金プラン: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Cloud Firestoreのクイックスタート・ルール: https://firebase.google.com/docs/firestore/quickstart
- Firebase Web SDK: https://firebase.google.com/docs/web/learn-more
- FirebaseでTwitterログイン: https://firebase.google.com/docs/auth/web/twitter-login


## Firebase設定

`js/firebase-config.js` には、プロジェクト `face-61ed1` のWebアプリ設定を入力済みです。GitHubへアップロードする前に、Firebase Consoleで Authentication の Email/Password を有効化し、Firestore Databaseを作成して `firestore.rules` を公開してください。Authenticationの承認済みドメインに `pan933.github.io` が含まれることも確認してください。
