/* 错题照片：按需加载本地 OCR，不向第三方上传图片。 */

const root = new URL('./assets/', document.baseURI).href;
let ocrLibrary;
let katexLibrary;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error('识别组件加载失败，请检查网络后重试'));
    document.head.appendChild(script);
  });
}

export async function normalizePhoto(file) {
  if (!file || (file.type && !file.type.startsWith('image/'))) throw new Error('请选择图片文件');
  if (file.size > 20 * 1024 * 1024) throw new Error('照片不能超过 20 MB');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const ratio = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    if (dataUrl.length > 2_400_000) {
      const second = document.createElement('canvas');
      const shrink = Math.min(1, 1800 / Math.max(canvas.width, canvas.height));
      second.width = Math.round(canvas.width * shrink);
      second.height = Math.round(canvas.height * shrink);
      second.getContext('2d').drawImage(canvas, 0, 0, second.width, second.height);
      dataUrl = second.toDataURL('image/jpeg', 0.82);
    }
    if (dataUrl.length > 2_400_000) throw new Error('图片内容太复杂，请裁剪题目后再拍');
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadImage(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}

export async function cropQuestionPhoto(dataUrl, region) {
  const image = await loadImage(dataUrl);
  const x = Math.round(region.x * image.naturalWidth);
  const y = Math.round(region.y * image.naturalHeight);
  const width = Math.max(1, Math.min(image.naturalWidth - x, Math.round(region.width * image.naturalWidth)));
  const height = Math.max(1, Math.min(image.naturalHeight - y, Math.round(region.height * image.naturalHeight)));
  if (width < 80 || height < 40) throw new Error('框选范围太小，请重新框选题目');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

async function enhanceForOCR(dataUrl) {
  const image = await loadImage(dataUrl);
  const scale = Math.min(2.4, Math.max(1, 2100 / image.naturalWidth));
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(2800, Math.round(image.naturalWidth * scale));
  canvas.height = Math.min(3200, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = pixels;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) histogram[Math.round(.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2])]++;
  const total = canvas.width * canvas.height;
  let low = 0, high = 255, count = 0;
  while (low < 255 && (count += histogram[low]) < total * .015) low++;
  count = 0;
  while (high > low + 1 && (count += histogram[high]) < total * .015) high--;
  const span = Math.max(50, high - low);
  for (let i = 0; i < data.length; i += 4) {
    const lum = .299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2];
    const value = Math.max(0, Math.min(255, (lum - low) * 255 / span));
    data[i] = data[i + 1] = data[i + 2] = value;
  }
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

export async function recognizeQuestion(dataUrl, onProgress = () => {}) {
  try {
    onProgress({ status: 'loading local model', progress: 0 });
    const { recognizeWithPaddle } = await import(`${root}paddle/paddle-entry.mjs`);
    const result = await recognizeWithPaddle(dataUrl);
    if (result.text.trim()) return { ...result, alternative: '', engine: 'paddle' };
  } catch (error) {
    console.warn('[juren] PaddleOCR unavailable; trying lightweight OCR', error);
    onProgress({ status: 'falling back to lightweight OCR', progress: 0 });
  }
  ocrLibrary ||= loadScript(`${root}ocr/tesseract.min.js`);
  await ocrLibrary;
  const worker = await window.Tesseract.createWorker('chi_sim', 1, {
    workerPath: `${root}ocr/worker.min.js`,
    corePath: `${root}ocr/`,
    langPath: `${root}ocr/lang/`,
    logger: (status) => onProgress(status),
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
    const original = await worker.recognize(dataUrl);
    onProgress({ status: 'enhancing image', progress: 0 });
    const enhanced = await enhanceForOCR(dataUrl);
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const processed = await worker.recognize(enhanced);
    const tidy = (raw) => {
      let text = raw.trim();
      let cleaned;
      do {
        cleaned = text;
        text = text.replace(/(\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, '$1');
      } while (cleaned !== text);
      return text;
    };
    const variants = [original, processed].map(({ data }) => ({ text: tidy(data.text), confidence: data.confidence || 0 }));
    variants.sort((a, b) => b.confidence - a.confidence);
    const text = variants[0].text || variants[1].text;
    return { text, alternative: variants[1].text !== variants[0].text ? variants[1].text : '', confidence: Math.round(variants[0].confidence), engine: 'tesseract' };
  } finally {
    await worker.terminate();
  }
}

export async function loadMathRenderer() {
  katexLibrary ||= Promise.all([
    new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${root}math/katex.min.css`;
      link.onload = resolve;
      link.onerror = reject;
      document.head.appendChild(link);
    }),
    loadScript(`${root}math/katex.min.js`),
  ]);
  await katexLibrary;
  return window.katex;
}

export function renderQuestionMath(source, katex = window.katex) {
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const tokens = [];
  // 数学式由用户输入为 LaTeX；OCR 不会被当作已校验的公式。
  const placeholder = String(source).replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (match, a, b, c, d) => {
    const tex = a ?? b ?? c ?? d;
    if (!katex) throw new Error('公式组件尚未加载');
    try {
      tokens.push(katex.renderToString(tex, { throwOnError: true, trust: false, displayMode: a != null || b != null }));
    } catch (err) {
      throw new Error(`公式写法需要检查：${err.message}`);
    }
    return `\u0001${tokens.length - 1}\u0002`;
  });
  return escape(placeholder).replace(/\u0001(\d+)\u0002/g, (_, index) => tokens[Number(index)]).replace(/\n/g, '<br>');
}
