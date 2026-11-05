# Markdown Overview

Claude の回答（Markdown）を **見やすく表示するためだけ** の静的ページです。ビルド不要、サーバー不要。

公開先: https://gosyujin.github.io/markdown-overview/

## 使い方

1. 入力欄に Markdown を貼り付ける（または `.md` / `.txt` を選択・ドロップ）
2. 右側にレンダリング結果が表示される
3. コードブロック・表にホバー（またはフォーカス）すると「コピー」ボタンが出る
   - 表は「コピー」= タブ区切り（Excel / スプレッドシート向け）、「Markdown」= Markdown 表
4. ヘッダーの **[Raw | Mask]** で表示を切り替える。Mask では「マスク設定」の定義で語句を置換して表示する（コピーされる内容も置換後）

### マスク定義の書式

```
丸丸システム, システムA
山田商事 => 取引先B
# 行頭 # はコメント
```

- 1行1ルール。区切りは `,` / `=>` / `->` / `→` / タブ
- 長い語句が優先、大文字小文字は区別、置換は連鎖しない（A→B と B→C があっても A は B になる）
- 正規表現ではなく常に文字列として扱う

## プライバシー / セキュリティ設計

| 項目 | 内容 |
| --- | --- |
| 入力内容 | メモリ（DOM）上のみ。`localStorage` / Cookie / IndexedDB は一切使わない。リロード・閉じると消える |
| 外部通信 | しない。CSP（`connect-src 'none'`、`script-src 'self'`、`img-src data:`）で**ブラウザ側からも禁止** |
| ライブラリ | CDN を使わず `vendor/` に同梱（実行時にサードパーティへアクセスしない） |
| HTML の混入 | [DOMPurify](https://github.com/cure53/DOMPurify) でサニタイズ。外部画像は取得せずプレースホルダ表示。リンクは `http(s)` / `mailto` のみ有効（`noreferrer` 付き） |
| マスク定義 | 同様にメモリ上のみ。永続化したい場合は、パスフレーズ付き**暗号化ファイル**（AES-256-GCM / PBKDF2-SHA256 60万回、ブラウザ内の Web Crypto で完結）として手元に保存し、次回読み込む |

注意:

- マスクは**表示と、そこからのコピー**に対してだけ働きます。入力欄（元テキスト）は置換されません。画面共有時は入力欄を隠してください（ヘッダーの「入力欄を隠す」、狭い画面で表示）。
- 暗号化ファイルのパスフレーズを忘れると復元できません。
- Web Crypto は https または localhost でのみ使えます（GitHub Pages は https）。

## 開発

```bash
npm run serve   # http://localhost:8000
npm test        # マスク処理・暗号化のユニットテスト
```

- `js/mask.js` … ルールのパースと置換（純粋関数）
- `js/vault.js` … 暗号化／復号
- `js/app.js` … レンダリング・コピー・UI
- `vendor/` … marked / DOMPurify / highlight.js（ライセンスは `vendor/LICENSE.*`）

デプロイ: `main` ブランチのルートを GitHub Pages で公開（ビルド工程なし）。
