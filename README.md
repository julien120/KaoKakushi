# Kao Kakushi — 顔を、そっと隠す

[![CI / Deploy](https://github.com/julien120/KaoKakushi/actions/workflows/ci.yml/badge.svg)](https://github.com/julien120/KaoKakushi/actions/workflows/ci.yml)

**公開サイト: https://julien120.github.io/KaoKakushi/**

写真をドラッグ＆ドロップすると顔を自動検出してぼかす、SNS 時代のプライバシー保護ツール。
**処理はすべてブラウザ内で完結し、画像は一切どこにも送信されません。**
main への push で GitHub Actions がテスト（Vitest + Playwright 3 プロファイル）を実行し、
green なら GitHub Pages へ自動デプロイします。

## 特徴

- **ドラッグ＆ドロップ / クリック選択 / Ctrl+V 貼り付け** で写真を読み込み
- **顔の自動検出 + 自動ぼかし**（YuNet + ONNX Runtime Web、WASM/モデルはセルフホスト）
- **ブラシ 2 モード**
  - ぼかし解除（保護）: 塗った場所は顔があってもぼかさない
  - ぼかし追加: 検出漏れや顔以外（名札・住所表示など）も手動でぼかせる
- **ぼかし / モザイク** の切り替えと強さスライダー
- **取り消し (undo)**、PNG / JPEG での**ダウンロード**
- **レスポンシブ + タッチ対応**（スマホのブラウザでも使える）

## プライバシー設計

| 項目 | 内容 |
|---|---|
| 画像の送信 | **ゼロ**。顔検出モデル・WASM も同一オリジンから配信され、実行時の外部通信は一切ない（`e2e/privacy.spec.ts` で自動検証） |
| メタデータ | 書き出しは canvas 再エンコードのため、EXIF（撮影場所の GPS・撮影者名など）は必ず除去される |
| ぼかしの強度 | 弱いガウスぼかしは復元攻撃に弱いため、一度大きく縮小して情報を破棄してから拡大する方式 |

## 開発

```bash
npm install        # postinstall で ONNX Runtime の WASM を public/ort へコピー
npm run dev        # 開発サーバー
npm test           # ユニットテスト (Vitest)
npm run test:e2e   # E2E (Playwright: Chromium / WebKit / モバイル)
npm run build      # 型チェック + 本番ビルド → dist/
```

顔検出モデル `public/models/face_detection_yunet_2023mar.onnx` はリポジトリに同梱
（出典: [OpenCV Zoo YuNet](https://huggingface.co/opencv/face_detection_yunet), MIT License, 約 233KB）。

## アーキテクチャ

```
source ──► blurred（強度/スタイル変更時に再生成）
   │            │ destination-in
   │            ▼
   │        maskedBlur ◄── mask（白 = ぼかす領域）
   ▼            │
composite = source + maskedBlur ──► 表示キャンバス ──► toBlob 書き出し
```

- `src/editor/mask-ops.ts` — マスク状態（検出顔 + ストローク列）の純粋 reducer。undo は操作リストの巻き戻し
- `src/editor/pipeline.ts` — レイヤー合成。保護ブラシは `destination-out` で消すため、構造的に自動検出より必ず優先される
- `src/detection/yunet-detector.ts` — 検出アダプタ。全体 + 2x2 オーバーラップタイルで再検出し IoU マージ（集合写真の小さい顔対策）
- `src/detection/yunet.ts` — YuNet ONNX 出力の純粋デコード（OpenCV `face_detect.cpp` と同一の式、単体テスト済み）
- `src/detection/types.ts` — `FaceDetectionAdapter` インターフェース。検出器差し替えの継ぎ目

## 検出ライブラリの変遷（精度問題の記録）

当初は MediaPipe BlazeFace short-range を採用したが、**モデル入力が 128px 固定のため
集合写真の小さい顔（画像比 3〜5%）が検出限界以下**になり、実写真で 0 件という不具合が発生。
[YuNet](https://huggingface.co/opencv/face_detection_yunet)（WIDER Face AP_hard 0.708、
〜10px の顔まで検出可能）へ差し替えて解決した。実際の 5 人の集合写真での回帰テストを
`e2e/face-blur.spec.ts` に常設している。

- HuggingFace 配布の YuNet ONNX は入力 640x640 固定のため、各検出パスはアスペクト比を
  保ったレターボックスで 640x640 に載せる（右下黒パディング、座標は逆変換で復元）
- それでも検出漏れがある場合の逃げ道: 「ぼかし追加」ブラシでいつでも手動リカバリできる（UI でも案内）

## テスト

- **Vitest** (47): 座標変換・タイル分割/IoU マージ・マスク reducer・YuNet デコード・ファイル判定の純粋ロジック
- **Playwright** (19 テスト × 3 プロファイル): 投入→検出→顔画素の変化と背景の不変をピクセル検証、
  実物の集合写真で 5 顔検出の回帰テスト、ブラシ（保護/追加/後勝ち/undo/タッチ）、
  書き出し（PNG 署名・EXIF 除去）、エッジケース（巨大画像キャップ・EXIF 回転・非画像拒否・
  連続投入・モデルロード失敗）、外部通信ゼロ

フィクスチャのライセンスは `e2e/fixtures/LICENSES.md` を参照。

## デザイン

`design.md`（デザインガイドライン）に基づく。題材の「ぼかし」は浮世絵の摺り技法
*bokashi* が語源であることから、胡粉の紙地 + 墨 + 藍 + 一点の朱によるインクウォッシュの画面。
外部フォントも読み込まない（プライバシー宣言の一部）。
