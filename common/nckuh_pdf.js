// 成大「三個月資料摘要」PDF 解析（純函式；無 DOM、無網路、不寫儲存）。規則：spec/common/nckuh_3m_pdf.md。
// 輸入是 pdf.js 抽出的文字項（nckuh_pdf_load.js 產生）：pages[] = { height, items: [{ str, x, y, w, font, composite }] }（y 為 PDF 座標，下往上）。
// 每頁頁首（院名、病歷號碼、病人完整姓名、性別年齡、頁次、檢驗日期）只取性別、年齡、資料窗迄日，其餘丟棄、不進任何輸出；
// 頁首的姓名另用來遮蔽報告本文裡出現的同一姓名（例：超音波報告本文自帶「病人姓名：…」）。
// 錯誤訊息是固定字串，不回顯檔案內容。
import { GLYPHS } from './nckuh_glyphs.js';

export const ERR = {
  notPdf: '無法讀取此 PDF 檔。',
  format: '無法解析此 PDF（不是成大三個月資料摘要格式，或院方字型改版），請改用 .json 或手動輸入。未帶入任何資料。',
};
const HOSPITAL = '國立成功大學醫學院附設醫院';
export const MASK_NAME = '[姓名已移除]'; // 與 Card 4 sanitize.js 相同字串

// ── §2 中文解碼：Type0 字型的字元碼＝原字型 GID ──
const TABLES = {};
const tableOf = (font) => {
  const base = String(font ?? '').replace(/^[A-Z]{6}\+/, '');
  if (!(base in GLYPHS)) return null;
  if (!TABLES[base]) TABLES[base] = Array.from(GLYPHS[base]);
  return TABLES[base];
};
// 不認得的 Type0 字型 → null（呼叫端 fail-loud）；GID 0（.notdef，原檔即缺字）或表外 → U+FFFD
export function decodeStr(str, font, composite) {
  if (!composite) return str;
  const t = tableOf(font);
  if (!t) return null;
  let out = '';
  for (const ch of str) {
    const c = t[ch.codePointAt(0)];
    out += c && c !== '\u0000' ? c : '\uFFFD';
  }
  return out;
}

// ── 組行：同一基線（容差 2pt）為一行；相鄰文字項間距 <3pt 併成一格 ──
const Y_TOL = 2;
const CELL_GAP = 3;
const UNKNOWN_FONT = new Error('unknown composite font');
export function pageLines(page) {
  const items = page.items
    .map((it) => {
      const str = decodeStr(it.str, it.font, it.composite);
      if (str === null) throw UNKNOWN_FONT;
      return { str, x: it.x, x2: it.x + (it.w || 0), top: page.height - it.y };
    })
    .filter((it) => it.str.trim() !== '')
    .sort((a, b) => a.top - b.top || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const ln = lines.find((l) => Math.abs(l.top - it.top) <= Y_TOL);
    if (ln) ln.items.push(it); else lines.push({ top: it.top, items: [it] });
  }
  lines.sort((a, b) => a.top - b.top);
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.cells = [];
    for (const it of l.items) {
      const c = l.cells.at(-1);
      if (c && it.x - c.x2 < CELL_GAP) { c.str += (it.x - c.x2 > 1.5 && !/\s$/.test(c.str) && !/^\s/.test(it.str) ? ' ' : '') + it.str; c.x2 = Math.max(c.x2, it.x2); }
      else l.cells.push({ x: it.x, x2: it.x2, str: it.str });
    }
    for (const c of l.cells) c.text = c.str.trim();
    l.text = l.cells.map((c) => c.str).join(' ').replace(/[ \t]+$/, '');
  }
  return lines;
}

// ── §3 頁首帶：到「檢驗日期：」那一行為止（含）；帶內須有 病歷號碼、頁次 ──
const DATE_RANGE = /檢驗日期[:：]\s*(\d{8})\s*[～~]\s*(\d{8})/;
function splitHeader(lines) {
  const end = lines.findIndex((l) => DATE_RANGE.test(l.text));
  if (end < 0) return null;
  const band = lines.slice(0, end + 1).map((l) => l.text).join('\n');
  if (!band.includes('病歷號碼') || !band.includes('頁次')) return null;
  // 姓名：病歷號碼那一行整行文字扣掉已知欄位（病歷號碼＋號碼、緊貼「年齡」的性別＋年齡、頁次）後剩下的文字（只用於遮蔽，不輸出）。
  // 不靠分格（姓名可能與病歷號併成同一格）；只剝緊貼「年齡」的性別字，姓名尾字是男／女不受影響。取不到 → null（呼叫端 fail-loud）
  const idLine = lines.slice(0, end + 1).find((l) => l.text.includes('病歷號碼'));
  const rest = idLine.text.replace(/病歷號碼[:：]?\s*[0-9０-９]*/, ' ').replace(/[男女]?\s*年齡[:：]\s*\d{0,3}/, ' ').replace(/頁次[:：]?\s*\d*\s*\/?\s*\d*/, ' ').trim();
  if (rest.length < 2) return null;
  const names = [rest, rest.replace(/\s+/g, ''), ...rest.split(/\s+/).filter((t) => t.length >= 2)];
  return { band, names, body: lines.slice(end + 1) };
}
const isoOf8 = (s) => {
  const [y, m, d] = [Number(s.slice(0, 4)), Number(s.slice(4, 6)), Number(s.slice(6, 8))];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
};
const isoOfSlash = (s) => isoOf8(s.replace(/\//g, ''));

// ── 檢驗網格 ──
const DATE_CELL = /^\d{4}\/\d{2}\/\d{2}$/;
const EMPTY_CELL = /^[‧·.\s]*$/;
// 項目代號：中文名前的部分（eGFR(CKD-EPI)(估算… → eGFR(CKD-EPI)）
export function itemCode(name) {
  const m = /^(.*?)\((?=[㐀-鿿])/.exec(name);
  return (m ? m[1] : name).trim();
}
export function cleanValue(s) {
  const t = s.replace(/\s+/g, ' ').trim();
  const f = /^(HH|LL|H|L)\s+(.*)$/.exec(t);
  const raw = f ? f[2] : t;
  const m = /^([≧≦≥≤<>＜＞=]*)(\d+(?:\.\d+)?)$/.exec(raw.replace(/\s+/g, ''));
  const out = { raw, value: m ? Number(m[2]) : null };
  if (m && m[1]) out.qual = m[1];
  if (f) out.flag = f[1];
  return out;
}
// 表頭：「檢驗名稱」那一行，前一行是日期列。回傳 { cols: [{x, date}], refX }
function gridHead(lines, i) {
  const l = lines[i];
  const c0 = l.cells[0];
  if (!c0 || !/^檢驗名稱/.test(c0.text) || c0.x > 120) return null;
  const dl = lines[i - 1];
  const cols = dl ? dl.cells.filter((c) => DATE_CELL.test(c.text)).map((c) => ({ x: c.x, date: isoOfSlash(c.text) })) : [];
  if (!cols.length || cols.some((c) => !c.date)) return null;
  const refCell = l.cells.find((c) => /檢驗參考區間/.test(c.text));
  return { cols, refX: refCell ? refCell.x : cols[0].x - 60 };
}
// 表頭之前的標題、檢體列也不屬於報告本文：往回最多 3 行，到「…報告」標題為止
function gridStart(lines, i) {
  for (let k = i - 2; k >= Math.max(0, i - 4); k--) if (/報告\s*$/.test(lines[k].text)) return k;
  return i - 1;
}
function readGrid(lines, i, head, labs) {
  let j = i + 1;
  for (; j < lines.length; j++) {
    const l = lines[j];
    const c0 = l.cells[0];
    if (!c0 || /^(採檢時間|報告時間|確認人員)/.test(c0.text) || REPORT_HEAD.test(l.text) || gridHead(lines, j)) break;
    if (c0.x >= head.refX - 5) continue; // 名稱欄以外起頭的行（不屬於列）
    const vals = l.cells.filter((c) => c.x >= head.cols[0].x - 8);
    if (!vals.length) continue; // 名稱斷行的續行
    const item = itemCode(l.cells.filter((c) => c.x < head.refX - 5).map((c) => c.text).join(''));
    for (const c of vals) {
      if (EMPTY_CELL.test(c.text)) continue;
      const col = [...head.cols].reverse().find((h) => h.x <= c.x + 8);
      if (!col) continue;
      labs.push({ date: col.date, item, ...cleanValue(c.text) });
    }
  }
  return j;
}

// ── 報告段 ──
// 標頭行：行首 <類別>，同一行還有「醫師:」（版面：類別、醫師、檢查時間、單號、確認者同一行）。
// 只看行首 <…> 會把本文的「<1 cm tumor, margin >0.5 cm」誤當新報告（fresh review r1 F1）
const REPORT_HEAD_RE = /^\s*＊?\s*<([^<>]{2,40})>/;
const REPORT_HEAD = { test: (t) => REPORT_HEAD_RE.test(t) && /醫師[:：]/.test(t), exec: (t) => (/醫師[:：]/.test(t) ? REPORT_HEAD_RE.exec(t) : null) };
// 簽名列：內視鏡「檢查醫師:… / 主治醫師:…」、病理「Pathologists:」起至段尾、影像「<姓名>醫師-<科別> <編號>」
export function stripSignature(body) {
  return body
    .replace(/(^|\n)[^\n]*Pathologists?\s*[:：][\s\S]*$/i, '')
    .replace(/^[^\n]*(檢查醫師|主治醫師)\s*[:：][^\n]*$/gm, '')
    .replace(/^[^\n]*醫師-[^\n]*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\n|\s+$/g, '');
}
function readReport(lines, i, stops) {
  const m = REPORT_HEAD.exec(lines[i].text);
  let j = i + 1;
  while (j < lines.length && !stops.has(j) && !REPORT_HEAD.test(lines[j].text)) j++;
  // 版面：標頭行（類別、醫師、檢查時間、單號、確認者）→ 報告時間值（略高一點的獨立行）→「執行時間 <日期> 報告時間」行 → 本文
  const seg = lines.slice(i, j);
  const meta = seg.findIndex((l) => /執行時間/.test(l.text));
  const ex = meta >= 0 ? /執行時間\s*(\d{4}\/\d{2}\/\d{2})/.exec(seg[meta].text) : null;
  const key = lines[i].text.replace(/^\s*＊?\s*/, '').replace(/\s+/g, ' ');
  return { next: j, kind: m[1].trim(), date: ex ? isoOfSlash(ex[1]) : null, key, body: meta >= 0 ? seg.slice(meta + 1).map((l) => l.text).join('\n') : null };
}

// 主函式：pages → { ok, ref, sex, age, labs, reports, notices } 或 { ok:false, error }
export function parseNckuhPages(pages) {
  if (!Array.isArray(pages) || !pages.length) return { ok: false, error: ERR.format };
  let ref = null; let sex = null; let age = null;
  const body = [];
  const names = new Set();
  for (let p = 0; p < pages.length; p++) {
    let lines;
    try { lines = pageLines(pages[p]); } catch { return { ok: false, error: ERR.format }; }
    const h = splitHeader(lines);
    if (!h) return { ok: false, error: ERR.format };
    if (p === 0) {
      if (!h.band.includes(HOSPITAL)) return { ok: false, error: ERR.format };
      const r = DATE_RANGE.exec(h.band);
      ref = isoOf8(r[2]);
      const sa = /(男|女)\s*年齡[:：]\s*(\d{1,3})/.exec(h.band);
      if (sa) { sex = sa[1] === '男' ? 'M' : 'F'; age = Number(sa[2]); }
    }
    for (const n of h.names) if (n.length >= 2) names.add(n);
    for (const l of h.body) body.push({ ...l, page: p });
  }
  if (!ref) return { ok: false, error: ERR.format };

  // 網格範圍（標題列～表尾）不算報告本文
  const heads = new Map();
  const stops = new Set();
  for (let i = 0; i < body.length; i++) {
    const g = gridHead(body, i);
    if (g) { heads.set(i, g); stops.add(gridStart(body, i)); }
  }
  const labs = [];
  const reports = [];
  const notices = [];
  let unreadable = 0;
  for (let i = 0; i < body.length;) {
    if (heads.has(i)) { i = readGrid(body, i, heads.get(i), labs); continue; }
    if (REPORT_HEAD.test(body[i].text)) {
      const r = readReport(body, i, stops);
      const prev = reports.at(-1);
      // 跨頁續段：標頭（醫師／檢查列、單號列）與上一份相同
      if (prev && prev.key === r.key && prev.kind === r.kind) {
        const more = r.body ?? body.slice(i + 1, r.next).map((l) => l.text).join('\n');
        prev.body += `\n${more}`;
      } else if (r.body === null || !r.date) {
        unreadable++; // 固定字串，不回顯檔案內容
      } else reports.push(r);
      i = r.next;
      continue;
    }
    i++;
  }
  if (unreadable) notices.push(`有 ${unreadable} 份報告格式無法辨識，未帶入。`);
  const mask = (t) => [...names].reduce((acc, n) => acc.split(n).join(MASK_NAME), t);
  const out = {
    ok: true, ref, sex, age,
    labs: labs.map((l) => ({ ...l, item: mask(l.item), raw: mask(l.raw) })),
    reports: reports.map((r) => ({ kind: r.kind, date: r.date, body: mask(stripSignature(r.body)) })),
    notices,
  };
  const missing = JSON.stringify(out).split('\uFFFD').length - 1;
  if (missing) notices.push(`原檔有 ${missing} 個字缺字形，以 \uFFFD 顯示。`);
  return out;
}
