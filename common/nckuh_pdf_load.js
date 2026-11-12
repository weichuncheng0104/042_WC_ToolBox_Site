// 成大三個月資料摘要 PDF → 逐段文字（字型、座標）→ parseNckuhPages()。只在瀏覽器本機解析：pdf.js 為站內打包（common/vendor/pdfjs），
// 不載入外部字型／CMap／wasm，無任何網路請求、不寫儲存。規則：spec/common/nckuh_3m_pdf.md §3。
// 不用 getTextContent()：pdf.js 會把同名（ABCDEE+MingLiU）的 Type0 與 TrueType 字型文字併成同一項、只標第一個字型，無法逐字判斷要不要解碼。
// 改走 operator list：每個 showText 是一段，取當下字型（setFont）與文字位置（beginText／moveText／setTextMatrix／nextLine）。
// Type0（composite）字型的字元碼取 originalCharCode（＝CID＝原字型 GID），其餘取 pdf.js 的 unicode。
import { parseNckuhPages, ERR } from './nckuh_pdf.js';

export const MAX_PDF_BYTES = 30 * 1024 * 1024;
const OPTS = { fontExtraProperties: true, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 };

// 假設（成大 SSRS 版面，20 份實測成立）：每段文字以 beginText＋moveText／setTextMatrix 定位、無 cm（CTM）變換、Tm 無縮放旋轉；
// 不處理 Tc／Tw／Tz（只影響段內寬度，用於併格的間距）。院方版面若改用 CTM 或縮放，位置會錯 → 頁首錨點／網格表頭找不到時 fail-loud。
function runsOf(pdfjs, ol, fontOf) {
  const { OPS } = pdfjs;
  const items = [];
  let font = null; let size = 0; let lx = 0; let ly = 0; let leading = 0; let x = 0; let y = 0;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i]; const a = ol.argsArray[i];
    if (fn === OPS.beginText) { lx = 0; ly = 0; x = 0; y = 0; }
    else if (fn === OPS.setFont) { font = fontOf(a[0]); size = a[1]; }
    else if (fn === OPS.setLeading) leading = a[0];
    else if (fn === OPS.moveText) { lx += a[0]; ly += a[1]; x = lx; y = ly; }
    else if (fn === OPS.setLeadingMoveText) { leading = -a[1]; lx += a[0]; ly += a[1]; x = lx; y = ly; }
    else if (fn === OPS.setTextMatrix) { const m = a.length === 1 ? a[0] : a; lx = m[4]; ly = m[5]; x = lx; y = ly; }
    else if (fn === OPS.nextLine) { ly -= leading; x = lx; y = ly; }
    else if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
      if (fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) { ly -= leading; x = lx; y = ly; }
      const glyphs = a[0];
      let str = ''; let w = 0;
      for (const g of glyphs) {
        if (typeof g === 'number') { w -= (g / 1000) * size; continue; }
        if (!g) continue;
        str += font && font.composite ? String.fromCodePoint(g.originalCharCode) : (g.unicode || '');
        w += ((g.width || 0) / 1000) * size;
      }
      if (str) items.push({ str, x, y, w, font: font && font.font, composite: !!(font && font.composite) });
      x += w;
    }
  }
  return items;
}

// pdfjs：pdf.js 模組（瀏覽器用站內 vendor；node 驗證 script 可注入同版本 legacy build）；data：Uint8Array
export async function pagesFromPdf(pdfjs, data) {
  const task = pdfjs.getDocument({ ...OPTS, data });
  try {
    const doc = await task.promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const ol = await page.getOperatorList();
      const fonts = new Map();
      const fontOf = (name) => {
        if (!fonts.has(name)) {
          let f = null;
          try { f = page.commonObjs.get(name); } catch { f = null; }
          fonts.set(name, { font: f && f.name, composite: !!(f && f.composite) });
        }
        return fonts.get(name);
      };
      const [x0, y0, , y1] = page.view;
      pages.push({ height: y1 - y0, items: runsOf(pdfjs, ol, fontOf).map((it) => ({ ...it, x: it.x - x0, y: it.y - y0 })) });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

// 瀏覽器：File → parseNckuhPages() 結果（失敗為 { ok:false, error }，錯誤為固定字串）
export async function readNckuhPdf(file) {
  if (!file || file.size > MAX_PDF_BYTES) return { ok: false, error: ERR.notPdf };
  let pages;
  try {
    const pdfjs = await import('./vendor/pdfjs/pdf.min.js');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
    pages = await pagesFromPdf(pdfjs, new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { ok: false, error: ERR.notPdf };
  }
  try {
    return parseNckuhPages(pages);
  } catch {
    return { ok: false, error: ERR.format };
  }
}
