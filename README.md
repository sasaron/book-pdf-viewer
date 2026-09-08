# PDF Viewer

手元の PDF をドラッグ&ドロップで開いて読むためのビューア。ブラウザだけで動き、
PDF はどこにも送らない。日本語の技術書を読むために作っている。

- ファイル選択と D&D で開く。設定ファイルもサーバも要らない
- 複数の本をタブで行き来する。ページ位置と倍率は本ごとに保つ
- しおりは**内容のハッシュ**で覚えるので、ファイル名を変えても復元する
- PDF 内蔵の outline から目次を出し、現在位置をハイライトする
- テキストを選択してコピーできる
- 本文を読み上げる。コードや柱は読み飛ばす

## 動かす

[Deno](https://deno.com/) 2.9 以降が要る。Node.js は要らない。

```sh
deno install     # 依存を取る
deno task dev    # 開発サーバ
```

deno の版は [aqua](https://aquaproj.github.io/) で固定してある。CI と同じ版を使うなら:

```sh
aqua i
export PATH="$(aqua root-dir)/bin:$PATH"
```

| task | 中身 |
| --- | --- |
| `dev` | Vite の開発サーバ |
| `build` | 型チェックしてから `dist/` を作る |
| `preview` | `dist/` を配信する |
| `typecheck` | `tsc --noEmit` |
| `lint` | Biome (フォーマットと lint) |
| `fmt` | Biome で書き換える |
| `test` | `deno test` |

`file://` で `dist/index.html` を直接開くと module worker と相対 URL が動かない。
`deno task preview` を使う。

## 操作

| キー | |
| --- | --- |
| `←` `→` | ページ送り |
| `+` `-` | 拡大縮小 (0.5〜4倍) |
| `b` | このページにしおりを挟む / 外す |
| `r` | このページから読み上げる / 止める |
| `[` | サイドバーの開閉 |
| `Escape` | 読み上げを止める |

「幅」を押すと本文ペインの幅に合わせる。ウィンドウ幅やサイドバーの開閉に追従する。

## 保存されるもの

ブラウザの `localStorage` だけを使う。PDF 本体は保存しない。

| キー | 中身 |
| --- | --- |
| `pdfviewer:bookmarks:v1` | 本ごとのしおりと最後に開いたページ |
| `pdfviewer:ui` | サイドバーの開閉 |

しおりのキーは PDF の内容の SHA-256 の先頭16桁。ファイル名では引かない。
「〜 (1).pdf」のようなリネームや同名別内容でしおりが分裂・衝突するため。
改名しても同じ本として復元でき、版違いは正しく別扱いになる。

## 構成

```
src/main.ts        起動と配線
src/pdf/           pdfjs-dist に触れる層 (loader, renderer, textlayer, outline, text)
src/speech/        読み上げ (extract は純関数、speaker は Web Speech の副作用)
src/storage/       localStorage (bookmarks, prefs)
src/state/         ストアと型
src/ui/            DOM 生成。pdfjs-dist を import しない
src/styles/
```

依存は一方向に流す。`main.ts → ui/*` と `main.ts → pdf/*`。
`ui/*` は `pdfjs-dist` を import しない。`PDFDocumentProxy` はストアに入れず、
`pdf/loader.ts` の `Map<DocId, OpenDocument>` が持つ。

### pdfjs-dist のアセット

`pdfjs-dist` は実行時に4つのディレクトリを取りに来る。`vite-plugin-static-copy` で
`node_modules` から `dist/` へ写している。

| dir | ファイル数 | |
| --- | --- | --- |
| `cmaps/` | 169 | CJK の文字コード対応表。**無いと日本語が描画されない** |
| `standard_fonts/` | 16 | 標準14フォント |
| `wasm/` | 13 | OpenJPEG、JBIG2、QCMS |
| `iccs/` | 2 | CMYK→RGB の ICC プロファイル |

これらの URL は `document.baseURI` に対して絶対化している。`base: './'` のまま渡すと、
取りに行くのが worker なので `/assets/` からの相対解決になり、
SPA フォールバックの HTML を掴んで `WebAssembly.Module` が落ちる。
開発サーバでは素通りし、`preview` と本番でだけ壊れる。

ビルド後に数を確かめられる。

```sh
ls dist/cmaps | wc -l   # 169
```

## テスト

```sh
deno task test
```

`deno test` を使う。テストは Deno 固有 API を使わず `node:test` と `node:assert/strict` で書く。
`Deno.test` と `jsr:` 指定子を使うと tsc が読めず、`tests/` を型チェックから外すことになるため。
`localStorage` は Deno 組み込みのものを使うので `--location` が要る。

`tests/fixtures/textcontent.json` は手で組んだテキスト層。pdf.js の `getTextContent` が
返す形をそのまま持ち、ページごとに1つの判定を受け持つ。

| ページ | 見るもの |
| --- | --- |
| `10` | 天の柱と、地のノンブル・柱が落ちる |
| `11` | 等幅が主のページが畳まれ、前後の地の文だけ残る |
| `12` | 文が句点で切れ、長い文が読点で分かれる |

版面の数値 (高さ 660.472、本文 8.26pt、天 613.11) は A5 の技術書に合わせてあるが、
文字列は自作で、実在の本のページは入っていない。

手元の PDF で挙動を確かめるときは `scripts/dump-textcontent.mjs` がテキスト層を落とす。
出力はフィクスチャと同じ形だが、中身は本文そのものなのでリポジトリには入れない。

```sh
deno run -A scripts/dump-textcontent.mjs <pdf> <page>... > /tmp/textcontent.json
```

## CI とバージョン更新

`.github/workflows/ci.yml` が push と PR で `typecheck` / `lint` / `test` / `build` を回す。
deno は aqua が入れるので、CI と手元で同じ版になる。`aqua-checksums.json` に
全プラットフォーム分の SHA-256 を置き、`require_checksum: true` で検証を必須にしている。

依存の更新は Renovate に任せる。`deno` manager が `deno.json` と、
`deno.lock` が隣にある `package.json` の両方を読み、lock も更新する。
aqua.yaml と aqua-installer の版は `aqua-renovate-config` が追う。

`pdfjs-dist` だけは他とまとめず単独の PR にして `needs-cjk-check` を付ける。
版を上げると CJK 描画を確かめ直す必要があるため。`typescript` も単独にしてある。

`aqua-checksums.json` は Renovate では更新されない。aqua の版を上げる PR では
`aqua update-checksum --all` を回して入れ直す。

## 決めたこと

- **UI フレームワークを入れない。** 主役が canvas への命令的描画で、DOM は一覧と
  ツールバーだけ。仮想 DOM の取り分が小さい
- **`pdfjs-dist` は 6.3.289 に固定。** [CVE-2026-16633](https://advisories.gitlab.com/npm/pdfjs-dist/CVE-2026-16633/)
  修正済み。生の `getDocument` API を使うので、この CVE の主経路である `enableScripting`
  (ビューア層専用オプション) には到達しない。多層防御として `isEvalSupported: false` も渡す
- **型は公開エントリから派生させる。** `pdfjs-dist` が公開する型は6つだけで
  `TextItem` などは非公開。内部パスはバージョン間で移動するので
  `Awaited<ReturnType<...>>` で導く (`src/pdf/pdf-types.ts`)
- **描画の直列化は `RenderTask.cancel()`。** 新しい要求が来たら走行中を捨てる。
  `getPage` の await は cancel できないので、追い越しは世代番号でも見る
- **canvas の面積上限はブラウザで出し分ける。** 16,777,216 は iOS Safari の値で、
  Chrome と Firefox は桁が違う。一律にすると拡大時に不必要に解像度を落とす

## 未確認

- **Safari で動かしていない。** canvas 面積上限の Safari 分岐と、読み上げの keepAlive
  (Chrome 限定分岐) はどちらも Chrome では通らない経路

## ライセンス

[pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) を使っている。
