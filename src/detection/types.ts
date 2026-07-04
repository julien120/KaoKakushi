/** 自然画像ピクセル座標系での顔バウンディングボックス */
export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

/**
 * 顔検出器の差し替え可能な継ぎ目。
 * 精度不足時は YuNet (onnxruntime-web) 実装にここだけ差し替える。
 */
export interface FaceDetectionAdapter {
  init(): Promise<void>;
  detect(image: ImageBitmap): Promise<FaceBox[]>;
}
