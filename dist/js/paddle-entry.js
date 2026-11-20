/* 官方 PaddleOCR.js：模型和 WASM 均由本站托管，题目照片不上传。 */
import { PaddleOCR } from '@paddleocr/paddleocr-js';

let enginePromise;
const base = new URL('./', import.meta.url);

export async function recognizeWithPaddle(imageDataUrl) {
  enginePromise ||= PaddleOCR.create({
    lang: 'ch',
    ocrVersion: 'PP-OCRv5',
    textDetectionModelName: 'PP-OCRv5_mobile_det',
    textDetectionModelAsset: { url: new URL('models/det.tar', base).href },
    textRecognitionModelName: 'PP-OCRv5_mobile_rec',
    textRecognitionModelAsset: { url: new URL('models/rec.tar', base).href },
    ortOptions: {
      backend: 'wasm',
      wasmPaths: new URL('ort/', base).href,
      numThreads: 1,
      simd: true,
    },
  }).catch((error) => { enginePromise = null; throw error; });
  const engine = await enginePromise;
  const response = await fetch(imageDataUrl);
  const [result] = await engine.predict(await response.blob());
  return {
    text: result.items.map((item) => item.text).join('\n'),
    confidence: Math.round(100 * result.items.reduce((sum, item) => sum + (item.score || 0), 0) / Math.max(1, result.items.length)),
  };
}
