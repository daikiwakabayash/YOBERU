# YOBERU LINE 連携 - ユーザー側セットアップ手順書

## このドキュメントの読み方

LINE 公式アカウントを使った予約リマインド・問診票配信・お客様との双方向チャットを動かすために、**Vercel・Supabase・LINE Developers Console・Resend の 4 つの管理画面で設定が必要**です。

コード側の作業はすべて完了して push 済み（ブランチ `claude/salon-dashboard-vercel-setup-LOGZ3`、コミット `d477133`）なので、このドキュメントの作業を上から順に実施すれば動きます。

**所要時間の目安**: トータル 1〜2 時間（Resend の DNS 認証だけ別途半日〜1 日待つ場合あり）

---

## 用語集（最初にここを読むと迷いません）

| 用語 | 意味 | このプロジェクトでの役割 |
|---|---|---|
| **Vercel** | Next.js を作った会社が運営する、Web アプリのデプロイ（公開）サービス | YOBERU を本番公開するサーバー |
| **Supabase** | PostgreSQL（DB）+ 認証 + ストレージを一括提供する BaaS | 顧客・予約・LINE メッセージなどのデータ保存先 |
| **LINE Developers Console** | LINE 公式アカウントの「裏側」設定画面 | Webhook URL や認証トークンを発行 |
| **Resend** | メール送信 API サービス（SendGrid の Next.js 系後継） | 予約確認・リマインドメールの送信 |
| **Webhook** | 「外部サービスが何か起きたら、このURLに通知を送る」仕組み | LINE で友だち追加 / メッセージ受信時に YOBERU に通知 |
| **環境変数** | コードに書かない秘密の設定値（API キーなど） | Vercel ダッシュボードで GUI 入力 |
| **マイグレーション** | DB のテーブル構造を変更する SQL ファイル | 新規テーブル追加（ステップ 1 で実行） |
| **Channel Access Token** | LINE Messaging API でメッセージを送るための認証鍵 | 店舗ごとに違うので Supabase に保存（環境変数ではない） |
| **LIFF** | LINE 内で動く Web アプリの仕組み | リッチメニューから予約画面などへ遷移するハブ |

---

## 全体像（何を、なぜやるか）

```
┌──────────────────────────────────────────────────────────────┐
│  お客様のスマホ（LINE）                                          │
│   ↑↓                                                            │
│   │ ① 友だち追加 / メッセージ送受信                              │
│   │                                                              │
│   ▼                                                              │
│  LINE プラットフォーム ────► Webhook 通知                        │
│   ▲                              │                               │
│   │ ② Push (リマインド/予約確認)  ▼                               │
│   │                          ┌───────────────────────────────┐  │
│   └──────────────────────────│ Vercel（YOBERU 本番）           │  │
│                              │  ・/api/line/webhook             │  │
│                              │  ・Cron で 15 分毎にリマインド    │  │
│                              │  ・/line-chat ダッシュボード     │  │
│                              └────────────┬───────────────────┘  │
│                                           │                       │
│                                           ▼                       │
│                              ┌───────────────────────────────┐  │
│                              │ Supabase（DB）                  │  │
│                              │  ・shops (店舗ごとのLINE認証)    │  │
│                              │  ・customers (顧客LINE紐付け)    │  │
│                              │  ・line_messages (会話履歴)      │  │
│                              └───────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**なぜ 4 つも管理画面が必要なのか**:
- **LINE Developers**: LINE 側で「この公式アカウントを操作していいよ」という鍵を発行
- **Vercel**: その鍵を使ってアプリを動かす場所
- **Supabase**: 鍵やデータを保存する場所（鍵は店舗ごとに違うので env ではなく DB に入れる）
- **Resend**: メール送信専用（LINE 未連携の顧客向け）

---

## 実装済みの機能（コード側完成済み）

設定が完了すると以下が自動で動きます:

| 機能 | 動作 |
|---|---|
| 🔔 予約リマインド | LINE 連携済み顧客には LINE で、未連携にはメールで送信（自動振り分け） |
| ✅ 予約確認 | 予約直後に LINE に予約詳細 + 問診票 URL を送信 |
| 💬 双方向チャット | お客様からのメッセージをダッシュボード `/line-chat` で受信・返信 |
| 👋 友だち追加自動連携 | お客様が LINE 友だち追加すると、直近の予約データに自動で紐付け |
| 📋 リッチメニュー | 6 分割（予約 / マイページ / 問診票 / 来店履歴 / クーポン / お問い合わせ） |

---

## 作業ステップ（このあと Part 2, 3 で詳細）

| ステップ | 何をするか | 所要時間 | 待ち時間 |
|---|---|---|---|
| **1** | Supabase で DB マイグレーション実行 | 5 分 | なし |
| **2** | Vercel に環境変数を登録 | 10 分 | なし |
| **3** | Resend でドメイン認証 | 15 分 | DNS 反映待ち（1〜24h） |
| **4** | LINE Developers でチャネル作成 | 20 分 | なし |
| **5** | LINE で LIFF アプリ作成 | 10 分 | なし |
| **6** | YOBERU ダッシュボードで店舗ごとに LINE 認証情報入力 | 5 分 × 店舗数 | なし |
| **7**（任意） | リッチメニューを投入 | 10 分 + 画像作成 | なし |
| **8** | 動作確認（友だち追加 → メッセージ → 予約） | 15 分 | なし |

→ 詳細手順は **Part 2（ステップ 1〜3）** と **Part 3（ステップ 4〜8）** に続きます。

---

# Part 2: Supabase / Vercel / Resend のセットアップ

## ステップ 1: Supabase に DB マイグレーションを適用

### このステップで何が起きるか
新規テーブル `line_messages`（LINE 会話履歴の保存先）と、`shops` テーブルへの 2 カラム追加（`line_basic_id`, `line_add_friend_url`）を行います。これをやらないとチャット機能が動きません。

### 手順

**1-1. Supabase ダッシュボードを開く**

ブラウザで `https://supabase.com/dashboard` を開き、YOBERU のプロジェクトを選択してください。

**1-2. SQL Editor を開く**

左サイドバーに以下のメニューが並んでいます:
- 🏠 Home
- 📊 Table Editor
- 🔍 **SQL Editor** ← これをクリック
- 🔐 Authentication
- 📦 Storage
- ⚙️ Project Settings（一番下）

**1-3. 新しいクエリを作成**

SQL Editor 画面右上の「**+ New query**」ボタンをクリックすると、空のエディタ画面に切り替わります。

**1-4. マイグレーション SQL を貼り付け**

このリポジトリの `supabase/migrations/00030_line_two_way_chat.sql` の中身を **全文コピー** して、エディタに貼り付けます。

ファイルの中身は以下のようなものです（一部抜粋）:
```sql
CREATE TABLE IF NOT EXISTS line_messages (
  id BIGSERIAL PRIMARY KEY,
  shop_id INT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  ...
);

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS line_basic_id VARCHAR(32),
  ADD COLUMN IF NOT EXISTS line_add_friend_url VARCHAR(256);
```

**1-5. 実行**

エディタ右下の緑色の「**Run**」ボタン（または Ctrl/⌘ + Enter）をクリック。

成功すると下部に「**Success. No rows returned**」と表示されます。エラーが出たら、メッセージをそのまま貼って相談してください（よくあるのは「table line_messages already exists」というもので、これは既に作られているので無視 OK）。

**1-6. 確認**

左サイドバーの「**Table Editor**」を開き、テーブル一覧に `line_messages` が追加されていれば成功です。

### つまづきポイント
- SQL Editor のクエリ履歴に過去のクエリが残っていることがあります。**必ず + New query で空のエディタから始める**こと（古いクエリと混ざると意図しない実行になる）。

---

## ステップ 2: Vercel に環境変数を登録

### このステップで何が起きるか
アプリが動くために必要な「秘密の設定値」（API キーや URL）を Vercel に登録します。コードはこれを `process.env.XXX` で読みます。

### 手順

**2-1. Vercel ダッシュボードを開く**

`https://vercel.com/dashboard` にログイン。プロジェクト一覧から **yoberu** をクリック。

**2-2. Settings → Environment Variables を開く**

プロジェクト画面の上部タブに以下が並びます:
- Overview / Deployments / Analytics / Speed Insights / Logs / Storage / **Settings**

「**Settings**」タブをクリック → 左サイドバーから「**Environment Variables**」を選択。

**2-3. 環境変数を 1 つずつ追加**

画面上部の「**Key**」「**Value**」入力欄と、その下の **Environment** チェックボックス（Production / Preview / Development）が並んでいます。

以下を 1 つずつ入力 → 「**Save**」ボタンを押す（毎回画面がリロードされる）:

#### A. Supabase 関連（必須）
| Key | Value | Environment | Sensitive |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase の Project Settings → API の「Project URL」をコピー | Production + Preview + Development | OFF |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同じ画面の「Project API keys」→ `anon` `public` の値 | Production + Preview + Development | OFF |

> 💡 **Supabase の API キー取得手順**: Supabase ダッシュボード → 左下の歯車 ⚙️ Project Settings → 左サブメニューの「API」→ 上部に Project URL / 下部に anon key が表示されます。それぞれ右側のコピーアイコンでコピー。

#### B. アプリ URL（必須）
| Key | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://yoberu.vercel.app` |

> 💡 もし Vercel の Domains 設定で `yoberu.vercel.app` 以外が割り当てられている場合（例: `yoberu-daikiwakabayashis-projects.vercel.app`）はそちらを使ってください。確認: Project → Settings → **Domains** に表示されている URL。

#### C. メール送信（Resend）（必須）
| Key | Value | Sensitive |
|---|---|---|
| `RESEND_API_KEY` | ステップ 3 で取得（後で追加でも OK） | **ON**（鍵だから） |
| `YOBERU_MAIL_FROM` | `noreply@yurumu8.net` | OFF |

#### D. Cron 認可（必須）
| Key | Value | Sensitive |
|---|---|---|
| `CRON_SECRET` | ターミナルで `openssl rand -hex 32` を実行した出力 | **ON** |

> 💡 `openssl rand -hex 32` は乱数 64 文字を生成するコマンド。Mac/Linux なら標準でインストール済み。Windows なら PowerShell で `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")` でも代用可。

#### E. LINE 関連（ステップ 4-5 完了後に追加）
| Key | Value |
|---|---|
| `NEXT_PUBLIC_LINE_LIFF_ID` | ステップ 5 で発行（後でいい） |
| `NEXT_PUBLIC_DEFAULT_BOOK_SLUG` | YOBERU ダッシュボードで作った既存の予約リンクの slug（任意） |

**2-4. Sensitive トグルの意味**

「Sensitive」を **ON** にすると、登録後にダッシュボードで値が `••••••` でマスクされ、コピペで外に漏らせなくなります。**API キー・トークンは必ず ON** にしてください。

**2-5. 反映タイミング**

環境変数を追加・変更した直後の状態は、**既にデプロイされているアプリには反映されません**。次のいずれかが必要:

a) コードを 1 行でも変更して push → 自動デプロイで反映
b) Vercel ダッシュボードの「Deployments」タブ → 最新デプロイの右の「・・・」メニュー → **Redeploy**

### つまづきポイント
- **`NEXT_PUBLIC_` で始まるキー**はクライアント側（ブラウザ）にも露出します。秘密にしたい値（DB の service role key など）には絶対に使わないこと。
- **Production / Preview / Development の使い分け**:
  - Production = 本番ドメイン
  - Preview = git push の度に立つお試し URL
  - Development = `vercel env pull` でローカルに落とすとき
  - 迷ったら **3 つ全部チェック**で OK

---

## ステップ 3: Resend でメール送信ドメインを認証

### このステップで何が起きるか
Resend は「`yurumu8.net` から送信していい」と認めるために、ドメインの **DNS レコード**（SPF / DKIM / DMARC）を設定する必要があります。これをやらないと Gmail / Yahoo / iCloud 宛のメールが迷惑メール扱い、または完全ブロックされます。

### 手順

**3-1. Resend にサインアップ**

`https://resend.com/signup` でアカウント作成（GitHub 連携が早い）。無料プランで月 3,000 通まで送信可能。

**3-2. ドメインを追加**

サインインしたら左サイドバー「**Domains**」→ 右上「**Add Domain**」ボタン。

入力フォームで:
- **Name**: `yurumu8.net`
- **Region**: `Tokyo (ap-northeast-1)` 推奨

「Add」をクリック。

**3-3. DNS レコードが表示される**

「Configure DNS」画面に切り替わり、以下のような表が表示されます:

| Type | Name | Value | Priority |
|---|---|---|---|
| MX | send | feedback-smtp.ap-northeast-1.amazonses.com | 10 |
| TXT | send | v=spf1 include:amazonses.com ~all | - |
| TXT | resend._domainkey | p=MIGfMA0GCSqGSIb3DQ... (長い文字列) | - |

> ⚠️ **実際の値は人によって違う**ので、Resend 画面の値をそのままコピーしてください。

**3-4. ドメインレジストラに DNS レコードを追加**

`yurumu8.net` を管理しているレジストラ（お名前.com / Cloudflare / ムームードメイン など）の管理画面を開きます。

たとえば **お名前.com** の場合:
1. ドメイン Navi にログイン
2. ドメイン一覧から `yurumu8.net` を選択
3. 「DNS関連機能の設定」→「DNS レコード設定」
4. Resend の表に従って 3 行追加 → 保存

> 💡 **Cloudflare** を使っている場合は、DKIM レコード（`resend._domainkey`）の **Proxy ステータスを「DNS only」（灰色の雲）** にすること。「Proxied」（オレンジ雲）にすると認証が通りません。

**3-5. Resend 側で Verify ボタンをクリック**

DNS 設定が反映されるまで通常 5〜30 分（最大 24 時間）。Resend の Domains 画面で `yurumu8.net` の右の「Verify」ボタンを押し、**全 3 行が緑色のチェックマーク** になれば成功。

**3-6. API キーを発行**

左サイドバー「**API Keys**」→「**Create API Key**」:
- **Name**: `yoberu-production`
- **Permission**: `Sending access`
- **Domain**: `yurumu8.net`

→ 発行されたキー（`re_xxx...`）を **その場でコピー**（再表示できないため）。

**3-7. Vercel に登録**

ステップ 2 の `RESEND_API_KEY` にこの値を貼り付けます（Sensitive ON）。

### つまづきポイント
- **DNS 反映に時間がかかる**: 設定直後は Verify が失敗しがち。30 分待ってから再試行。
- **DMARC は段階的に**: いきなり `p=reject` にすると正規メールも止まる可能性。最初は `p=none` で運用してログを観察、問題なければ `quarantine` → `reject` の順に厳しくする。
- **送信元アドレスのドメイン一致**: `YOBERU_MAIL_FROM` で指定するアドレスのドメイン部分（`@` の後）が **必ず Verify 済みドメイン** と一致すること。`@gmail.com` などは使えません。

---

→ Part 3 では LINE Developers Console の設定（ステップ 4〜5）、ダッシュボードでの店舗設定（ステップ 6）、リッチメニュー（ステップ 7）、動作確認（ステップ 8）を解説します。

---

# Part 3: LINE Developers Console のセットアップ

## ステップ 4: Messaging API チャネルを作成

### このステップで何が起きるか
「YOBERU が公式 LINE アカウントを操作していい」という認証情報を発行します。**Channel Access Token**（メッセージ送信用の鍵）と **Channel Secret**（Webhook の署名検証用の鍵）の 2 つを取得するのがゴール。

### 用語の整理
- **Provider**: 会社単位のグループ（複数のチャネルを束ねる入れ物）
- **Channel**: 1 つの公式 LINE アカウントに対応する「アプリ枠」
- **Messaging API チャネル**: メッセージ送受信用のチャネル
- **LINE Login チャネル**: ログイン認証 + LIFF 用のチャネル（次のステップ 5 で作る）

### 手順

**4-1. LINE Developers Console にログイン**

`https://developers.line.biz/console/` にアクセス。LINE Business ID（個人 LINE と別）でログインします。初回はメールアドレスで登録。

**4-2. Provider を作成**

トップ画面に「**Create a new provider**」（新規プロバイダー作成）ボタン。
- **Provider name**: 会社名やブランド名（例: `Yurumu株式会社`）
- → Create

**4-3. Messaging API チャネルを作成**

Provider 画面に入ると「**Channels**」タブが見えます。「**Create a Messaging API channel**」を選択。

**入力項目**:
- **Channel type**: Messaging API（既に選択済）
- **Provider**: 4-2 で作ったもの
- **Channel icon**: 公式アカウントのアイコン画像（任意、後から変更可）
- **Channel name**: 公式アカウントの表示名（例: `ゆるむ整体院`）
- **Channel description**: 説明文（例: `予約管理 + リマインド`）
- **Category** / **Subcategory**: `Beauty / Salon` など適当に
- **Email address**: 連絡先（自分のメール）
- **Privacy policy URL** / **Terms of use URL**: 任意

利用規約 2 つにチェック → **Create**。

**4-4. Channel ID と Channel Secret を取得**

作成したチャネルを開き、上部タブから「**Basic settings**」を選択。以下が表示されます:

| 項目 | 用途 | コピーする？ |
|---|---|---|
| **Channel ID** | LINE 内部ID（公開しても OK） | ✅ コピー（後でダッシュボードで使う） |
| **Channel secret** | Webhook 署名検証鍵（**秘密**） | ✅ コピー |
| **Bot basic ID** | 公式アカウントの ID（@xxxxxxxx） | ✅ メモ（友だち追加URLに使う） |

→ メモ帳に 3 つを保存しておく（ステップ 6 で使います）。

**4-5. Channel Access Token を発行**

同じチャネルの上部タブから「**Messaging API**」を選択。下のほうにスクロールすると「**Channel access token**」セクションがあります。

**「Issue」または「Reissue」ボタンをクリック** → 長い文字列が表示されます。

> ⚠️ **重要: この値はこの瞬間にしか取得できません**（再発行は可能だが、その時点で旧トークンは無効化される）。**今すぐコピー**してメモに保存してください。

**4-6. Webhook URL を設定**

同じ「Messaging API」タブを下にスクロールすると「**Webhook settings**」セクションがあります。

**Webhook URL の入力欄に以下を貼り付け**:

```
https://yoberu.vercel.app/api/line/webhook
```

> ⚠️ Vercel のドメインが違う場合は、ステップ 2-3 の B で確認した URL に置き換えてください。

入力後「**Update**」ボタンをクリック → その下の「**Verify**」ボタンを押す。

**期待される結果**:
- 初回の Verify は **403 が返る可能性が高い**（DB に Channel Secret が保存されていないため、署名検証が失敗する）
- これは正常です。**ステップ 6 完了後にもう一度 Verify を押すと 200 OK** が返ります

**4-7. Webhook と応答メッセージの ON/OFF**

Webhook URL の下に以下のトグルが並んでいます:

| 項目 | 設定 | 理由 |
|---|---|---|
| **Use webhook** | **ON** | Webhook 自体を有効化 |
| **Webhook redelivery** | ON | 失敗時に再送 |
| **Auto-reply messages** | **OFF** | 自動応答が webhook と干渉する |
| **Greeting messages** | **OFF** 推奨 | webhook の follow イベントで welcome を返すため |

**4-8. 応答設定の詳細画面に移動して再確認**

「**Auto-reply messages**」の右の「**Edit**」リンクから LINE Official Account Manager（別画面）に飛びます。そこで:

- **応答モード**: 「**Bot**」（チャットボット）を選択
- **あいさつメッセージ**: OFF
- **応答メッセージ**: OFF
- **Webhook**: ON

→ 設定を保存。

### つまづきポイント
- **Channel Access Token が「(none)」と表示される**: Issue ボタンを押し忘れている。Reissue で発行可能（旧鍵は失効）。
- **「Use webhook」を ON にし忘れる**: webhook URL を登録しても OFF だと送られてこない。
- **応答モードが「Chat」になっている**: Bot にしないと webhook より自動応答が優先される。

---

## ステップ 5: LINE Login チャネルと LIFF アプリを作成

### このステップで何が起きるか
リッチメニューから `/line/liff` を開いた時に、LINE 内ブラウザで動く Web アプリ（LIFF）として認識させるための設定です。これがないとリッチメニューが普通の外部ブラウザで開いてしまい、LINE のユーザー情報が取れません。

### 手順

**5-1. 同じ Provider 内に LINE Login チャネルを追加**

Provider 画面に戻り、もう一度「**Create a new channel**」→ 今度は「**LINE Login**」を選択。

**入力項目**:
- **Region where you provide your service**: Japan
- **Channel name**: `YOBERU LIFF`（任意）
- **Channel description**: `予約・問診票への遷移用`
- **App types**: **Web app** にチェック（Native app はチェックしない）
- **Email address**: 自分のメール

利用規約に同意 → **Create**。

**5-2. LIFF アプリを追加**

作成したチャネルを開き、上部タブの「**LIFF**」を選択。「**Add**」ボタン。

**入力項目**:
| 項目 | 値 |
|---|---|
| **LIFF app name** | `YOBERU メニュー` |
| **Size** | **Full** （全画面）|
| **Endpoint URL** | `https://yoberu.vercel.app/line/liff` |
| **Scope** | `profile` と `openid` の両方にチェック |
| **Bot link feature** | OFF（デフォルト） |
| **Scan QR** | OFF |
| **Module mode** | OFF |

→ **Add**。

**5-3. LIFF ID をコピー**

作成すると一覧に LIFF ID（`1234567890-XxxxXxxx` のような形式）が表示されます。コピーしてメモ。

**5-4. Vercel に LIFF ID を登録**

ステップ 2 で先送りした以下を追加:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_LINE_LIFF_ID` | 5-3 でコピーした LIFF ID |

Save → Deployments タブから最新デプロイを **Redeploy** で反映。

### つまづきポイント
- **Endpoint URL のドメイン誤り**: `https://` を入れ忘れる、末尾にスラッシュを入れる、などで保存できない。コピペ推奨。
- **Scope の openid を入れ忘れる**: `liff.getProfile()` が動かなくなる。

---

→ Part 4 では YOBERU ダッシュボードでの店舗設定（ステップ 6）、リッチメニュー投入（ステップ 7）、動作確認（ステップ 8）、トラブルシューティングを解説します。

---

# Part 4: ダッシュボード設定 / 動作確認 / トラブル対応

## ステップ 6: YOBERU ダッシュボードで店舗ごとに LINE 認証情報を入力

### このステップで何が起きるか
ステップ 4 で取得した **Channel ID / Channel Secret / Channel Access Token** を、対応する店舗の Supabase レコードに保存します。**店舗ごとに公式 LINE アカウントが違う**ことを想定した設計のため、env ではなく DB に入れます。

### 手順

**6-1. YOBERU 本番にログイン**

ブラウザで `https://yoberu.vercel.app/login` にアクセス → 管理者アカウントでログイン。

> 💡 ステップ 2 の環境変数登録 → Redeploy が完了していないとログイン画面でエラーが出ます。先に 2 を完了させてください。

**6-2. 店舗一覧を開く**

左サイドバーから「**マスタ管理**」グループ →「**店舗**」をクリック。

**6-3. 該当店舗の編集画面に入る**

店舗一覧から、LINE 連携したい店舗の行をクリック → 編集画面へ。

**6-4. LINE 認証情報を入力**

編集画面を下にスクロールすると「**LINE 連携**」セクションがあります（既存実装）:

| 項目 | 入力値 |
|---|---|
| **LINE Channel ID** | ステップ 4-4 でメモした Channel ID |
| **LINE Channel Secret** | ステップ 4-4 でメモした Channel secret |
| **LINE Channel Access Token** | ステップ 4-5 でメモしたトークン |

入力したら画面下部の「**保存**」をクリック。

**6-5. Webhook の Verify を再実行**

ステップ 4-6 で 403 が返ってきていた Webhook 検証を、もう一度 LINE Developers Console から実行します:

1. LINE Developers Console → Messaging API チャネル → **Messaging API** タブ
2. Webhook settings の「**Verify**」ボタンをクリック
3. **「Success」と表示されれば、署名検証が通りました**

> もしまだ 403 が返る場合は、Channel Secret の貼り付けに前後スペースが入っている可能性大。一度 Supabase の Table Editor で `shops` テーブルを開いて、対象店舗の `line_channel_secret` を直接見て確認するのが早い。

**6-6. 複数店舗ある場合**

各店舗ごとに **別々の LINE 公式アカウント** を運用したい場合、ステップ 4 を店舗の数だけ繰り返してください（Provider は 1 つでも、Messaging API チャネルは複数作れます）。

すべての店舗で同じ公式 LINE を使う運用なら、全店舗のレコードに同じ Channel ID / Secret / Token を貼り付けて OK。

### つまづきポイント
- **店舗を選択中で間違える**: 右上の店舗セレクター（ShopSelector）で別店舗を表示している状態だと、設定が混ざる。編集対象の店舗を URL（`/store/<id>`）で確認すること。
- **コピー時の余分な空白**: Channel Secret の前後に空白が混入すると署名検証が落ちる。トリミング忘れずに。

---

## ステップ 7（任意）: リッチメニューを投入

### このステップで何が起きるか
LINE トーク画面下部に常時表示される **6 分割メニューパネル**（予約 / マイページ / 問診票 / 来店履歴 / クーポン / お問い合わせ）をインストールします。**コードリポジトリの `scripts/setup-line-rich-menu.ts` を 1 コマンドで実行するだけ**です。

> 💡 リッチメニューはユーザー体験を大きく上げますが、なくても LINE 連携は動きます。先にステップ 8 で動作確認してから取り組んでも OK。

### 7-1. リッチメニュー画像を準備

**仕様**:
- サイズ: **2500 × 1686 ピクセル**（3 列 × 2 行のレイアウト）
- 形式: PNG または JPEG
- ファイルサイズ: **1MB 以下**

各エリアに以下のラベルが入る画像を用意:

```
┌──────────┬──────────┬──────────┐
│  予約    │ マイページ│  問診票  │
├──────────┼──────────┼──────────┤
│ 来店履歴 │ クーポン │お問い合わせ│
└──────────┴──────────┴──────────┘
```

外注（Canva、ココナラ等）で 5,000〜15,000 円が相場。

### 7-2. ローカル環境を準備

リポジトリをクローン → 依存関係インストール:

```bash
git clone https://github.com/daikiwakabayash/yoberu.git
cd yoberu
git checkout claude/salon-dashboard-vercel-setup-LOGZ3
npm install
```

### 7-3. スクリプトを実行

ステップ 4-5 で取得した **Channel Access Token** と画像ファイルを使って:

```bash
# 画像なし（先に構造だけ）
npx ts-node scripts/setup-line-rich-menu.ts \
  --token=<LINE_CHANNEL_ACCESS_TOKEN> \
  --base=https://yoberu.vercel.app

# 画像つき完成版
npx ts-node scripts/setup-line-rich-menu.ts \
  --token=<LINE_CHANNEL_ACCESS_TOKEN> \
  --base=https://yoberu.vercel.app \
  --image=./rich-menu.png
```

成功すると以下が出力されます:
```
Creating rich menu...
✓ Created: richmenu-xxxxxxxx
Uploading ./rich-menu.png...
✓ Image uploaded
Setting as default...
✓ Set as default rich menu

完了。richMenuId = richmenu-xxxxxxxx
```

### 7-4. スマホで確認

公式 LINE のトーク画面を開く（既に友だち追加していれば、メニューを切り替えるには **トークルームをいったん閉じて開き直す**）。下部にリッチメニューが表示されていれば成功。

### つまづきポイント
- **画像サイズが厳密**: 2500×1686 以外だと API がエラーを返す。1MB 超えも NG。
- **ts-node が動かない**: `npx` を付けて実行するか、`npm install -g ts-node` で先にグローバルインストール。

---

## ステップ 8: 動作確認（end-to-end テスト）

ここまでの設定が正しく動いているか、上から順にチェックしていきます。**1 つでも失敗したら、その項目のトラブルシューティング（後述）を確認してから次へ進んでください**。

### 8-1. ログイン確認
- [ ] `https://yoberu.vercel.app/login` でログインできる
- [ ] 予約表（`/reservation`）が表示される

❌ ログイン画面でエラーが出る → ステップ 2 の環境変数（特に Supabase 関連）を再確認

### 8-2. LINE チャット画面の存在確認
- [ ] サイドバーに「**LINE チャット**」が見える（顧客管理グループ内）
- [ ] クリックすると `/line-chat` が開く
- [ ] 最初は「まだメッセージのやり取りがありません」と表示されている

### 8-3. 友だち追加 → ウェルカムメッセージ
**スマホで操作**:
- [ ] 公式アカウントの **Bot basic ID（@xxxxxxxx）** を LINE アプリで検索 → 友だち追加
- [ ] 「友だち追加ありがとうございます！」のメッセージが届く

❌ メッセージが届かない →
- LINE Official Account Manager で「応答モード」が **Bot** になっていない（ステップ 4-8 を再確認）
- shops テーブルの `line_channel_access_token` が空（ステップ 6 を再確認）

### 8-4. 顧客との自動紐付け
**前提**: そのスマホ番号で過去または直近に予約があること

- [ ] 予約データベースで該当顧客を検索 → `line_user_id` カラムに `U` で始まる長い文字列が入っている

確認方法: Supabase Table Editor → `customers` → 該当行を見る

❌ 紐付かない →
- その顧客に直近の予約がない（webhook の Strategy 2 は直近 10 件の予約から探す）
- 解決: テスト予約を 1 件作ってから、もう一度ブロック → 友だち追加でやり直す

### 8-5. お客様 → スタッフ方向のメッセージ
**スマホで操作**:
- [ ] 公式 LINE のトーク画面で「テスト」と送信

**ダッシュボードで確認**:
- [ ] `/line-chat` の一覧に該当顧客が現れる
- [ ] **赤い未読バッジ** がつく
- [ ] クリックでスレッドが開く
- [ ] 「テスト」が表示されている

### 8-6. スタッフ → お客様方向の返信
**ダッシュボードで操作**:
- [ ] スレッド画面下部のテキストエリアに「了解しました」と入力
- [ ] 紙飛行機アイコンをクリック（または Ctrl/⌘ + Enter）

**スマホで確認**:
- [ ] 公式 LINE トークに「了解しました」が届く

### 8-7. 予約確認 LINE の自動配信
**ダッシュボードで操作**:
- [ ] 予約表（`/reservation`）から、LINE 連携済みの顧客で **新規予約を作成**

**スマホで確認**:
- [ ] LINE に予約確認メッセージが届く
- [ ] 問診票 URL が含まれている（その店舗のブランドに問診票が登録されている場合）
- [ ] URL をタップ → 問診票が開く

### 8-8. リマインドの自動送信
**前提**:
- 予約リンク（`/booking-link`）の `reminder_settings` で「予約 1 日前に LINE で通知」を ON にしている
- テスト予約を **明日の日付** で作成

**待機**:
- [ ] Vercel の Cron Jobs（Settings → Cron Jobs）で `/api/cron/send-reminders` が **15 分以内** に実行される
- [ ] スマホに LINE でリマインドメッセージが届く

実行履歴の確認: Vercel ダッシュボード → Logs タブで `[REMINDER]` で検索。

### 8-9. メールリマインド（フォールバック確認）
**前提**:
- LINE 未連携の顧客で予約を作成
- 同じくリマインド設定 ON

- [ ] `YOBERU_MAIL_FROM` のアドレスから予約者のメールにリマインドが届く

❌ 届かない →
- Resend のドメイン認証が未完了（ステップ 3）
- 顧客のメールアドレスが空

---

## トラブルシューティング集

### 症状 A: Webhook Verify が常に 403

**確認順序**:
1. shops テーブルの `line_channel_secret` に値が入っているか
2. 値の前後に余分な空白・改行が入っていないか
3. LINE Developers Console の Channel secret と一致しているか
4. `line_channel_id` も埋まっているか（destination との突合に使う）

→ Supabase Table Editor で **直接 SQL クエリで確認**:
```sql
SELECT id, name, line_channel_id, line_channel_secret IS NOT NULL AS has_secret
FROM shops WHERE deleted_at IS NULL;
```

### 症状 B: メールが届かない

1. Resend ダッシュボード → Emails タブで送信履歴を確認
2. ステータスが **`bounced`** → 受信側ドメインがアドレスを拒絶（Gmail の SPF 不適合など）
3. ステータスが **`delivered`** なのに届かない → 受信側の迷惑メールフォルダ
4. ステータスがそもそも記録されない → `RESEND_API_KEY` が未設定または無効

### 症状 C: 友だち追加しても自動連携されない

webhook の現実装では「**直近 10 件の予約**」から `line_user_id` が空の顧客を 1 件選んで紐付けます。以下のケースで紐付かない:
- その店舗の予約が一切ない
- 直近 10 件全員が既に紐付け済み
- 該当顧客の予約が 11 件目以降にある

**対処**:
- テスト予約を作成してから友だち追加し直す
- または Supabase Table Editor で `customers` の `line_user_id` を手動入力

### 症状 D: リッチメニューが表示されない

1. `setup-line-rich-menu.ts` 実行時のログで `Set as default rich menu` が出ているか
2. スマホで **トークルームを一度閉じて開き直す**
3. LINE アプリのバージョンが古い → アプリ更新

### 症状 E: 問診票 URL がメッセージに含まれない

`feature/line-chat/services/sendBookingLineNotice.ts` は `questionnaires` テーブルから「ブランド配下の最初のアクティブな問診票」を取ります。問診票が 1 つもない場合は問診票パートが省略されます。

**対処**: ダッシュボードの「**マスタ管理 → 問診票**」（`/questionnaire`）で、新規問診票を 1 件作成してください。

### 症状 F: Vercel デプロイは成功したのに変更が反映されない

- 環境変数を変更した直後はビルド済みのアプリには反映されない
- **Deployments タブ → 最新デプロイ → 「・・・」 → Redeploy** を実行

---

## 設定値チェックリスト（完了確認）

ここまでの設定が全部終わったかセルフチェックできるリストです:

### Vercel 環境変数（全 7 項目）
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `RESEND_API_KEY` (Sensitive ON)
- [ ] `YOBERU_MAIL_FROM`
- [ ] `CRON_SECRET` (Sensitive ON)
- [ ] `NEXT_PUBLIC_LINE_LIFF_ID`

### Supabase
- [ ] マイグレーション 00030 を実行済み
- [ ] `shops` テーブルに各店舗の LINE 認証 3 点セットを入力済み

### LINE Developers Console
- [ ] Provider 作成済み
- [ ] Messaging API チャネル作成済み
- [ ] Channel Access Token 発行済み
- [ ] Webhook URL 登録済み（`https://yoberu.vercel.app/api/line/webhook`）
- [ ] Use webhook ON、Auto-reply OFF
- [ ] Webhook Verify が 200 OK
- [ ] LINE Login チャネル + LIFF アプリ作成済み

### Resend
- [ ] `yurumu8.net` ドメイン Verify 済み（緑のチェックマーク 3 つ）
- [ ] API キー発行 → Vercel に登録済み

### YOBERU ダッシュボード
- [ ] `/store` から各店舗に LINE 3 点セットを入力済み
- [ ] `/booking-link` のリマインド設定で LINE / Email を有効化

### 動作確認
- [ ] 友だち追加でウェルカム届く
- [ ] お客様 → スタッフ メッセージが届く
- [ ] スタッフ → お客様 返信が届く
- [ ] 新規予約で LINE 確認メッセージが届く
- [ ] リマインドが LINE / Email で届く

---

## 補足: コピペ用 URL 一覧

頻繁にコピペが必要な URL を最後にまとめます。

```
# Webhook URL（LINE Developers の Messaging API → Webhook settings に貼る）
https://yoberu.vercel.app/api/line/webhook

# LIFF Endpoint URL（LINE Developers の LIFF 作成画面に貼る）
https://yoberu.vercel.app/line/liff

# YOBERU ログイン URL
https://yoberu.vercel.app/login

# YOBERU 店舗設定
https://yoberu.vercel.app/store

# YOBERU LINE チャット
https://yoberu.vercel.app/line-chat

# Vercel プロジェクト設定
https://vercel.com/daikiwakabayashis-projects/yoberu/settings/environment-variables

# Supabase ダッシュボード
https://supabase.com/dashboard

# LINE Developers Console
https://developers.line.biz/console/

# Resend ダッシュボード
https://resend.com/domains
```

---

## 困ったときの相談の仕方

ステップごとにエラーが出たら、以下の情報を添えて相談してください:

1. **どのステップでつまづいたか**（例: 「ステップ 4-6 の Verify で 403」）
2. **エラーメッセージの全文**（コピペ）
3. **その時画面で何が表示されていたか**（スクショまたは説明）
4. **直前にやったこと**（例: 「Channel Secret を貼り付けて Save した」）

これで原因特定が速くなります。



