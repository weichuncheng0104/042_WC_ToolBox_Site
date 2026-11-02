// 健保雲端 .json 解析器（S22，純函式、無依賴、不發網路請求、不寫任何儲存）。
// 只收 032 書籤匯出的 schema "nhi-harvest/3"；以 rows[].data 的 key 組合認表（不靠頁籤名稱）。
// page_text 只抽性別與生日以計算年齡，抽完即丟；輸出不含姓名、身分證號、生日、page_text 或院所名稱。
// 錯誤訊息一律為固定字串（ERR），不回顯檔案內容。說明見 spec/lipid-nhi-202609/nhi_import.md。

export const SCHEMA = 'nhi-harvest/3';
export const MAX_KNOWN_VERSION = 7;

export const ERR = {
  notJson: '檔案不是有效的 JSON。',
  notBundle: '不是 032 健保雲端書籤匯出的檔案（缺 schema 欄位）。',
  oldSchema: '此檔為舊版書籤格式（nhi-harvest/1 或 /2），請以新版書籤重新擷取。',
  unsupported: '不支援的檔案格式（只接受 nhi-harvest/3）。',
  incomplete: '檔案內容不完整（缺頁籤資料或擷取時間）。',
};

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function validIso(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? iso(y, m, d) : null;
}

// 民國 YYY/MM/DD → 西元 YYYY-MM-DD；格式或日期無效 → null
export function rocToIso(s) {
  const m = /^\s*(\d{2,3})\/(\d{1,2})\/(\d{1,2})\s*$/.exec(String(s ?? ''));
  return m ? validIso(+m[1] + 1911, +m[2], +m[3]) : null;
}

// 檢驗值清理：帶不等號（≧、<…）不取值；N/A、-、空白視為無值；允許尾隨 mg/dL
export function cleanNumber(s) {
  const t = String(s ?? '').replace(/\s+/g, '');
  if (!t || /^(N\/?A|-+|—|無|none|null)$/i.test(t)) return { value: null, reason: 'empty' };
  if (/^[≧≦≥≤<>＜＞=]/.test(t)) return { value: null, reason: 'qualifier' };
  const m = /^(\d+(?:\.\d+)?)(?:mg\/dl)?$/i.exec(t);
  return m ? { value: Number(m[1]) } : { value: null, reason: 'nonnumeric' };
}

// ICD：去 HTML 標籤與小數點，取最後一個 ICD-10 樣式的碼（就醫列可能是「中文名<br />I251」）
export function normIcd(s) {
  const t = String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\./g, '').toUpperCase();
  const all = t.match(/[A-Z]\d[0-9A-Z]{1,5}/g);
  return all ? all[all.length - 1] : null;
}

// 列種類：依 data 的 key 組合
function kindOf(d) {
  if ('assay_value' in d && 'real_inspect_date' in d && 'order_code' in d) return 'lab';
  if ('drug_code' in d && 'drug_date' in d) return 'drug';
  if ('in_date' in d && 'out_date' in d) return 'discharge';
  if (('met_c_name' in d || 'met_e_name' in d) && 'order_code' in d) return 'material';
  if ('exe_s_date' in d && 'order_code' in d) return 'procedure';
  return 'other';
}
export const SOURCE_LABEL = { lab: '檢驗', drug: '用藥', discharge: '出院病摘', material: '特材', procedure: '手術／處置', other: '就醫紀錄' };
const DATE_KEYS = ['drug_date', 'real_inspect_date', 'in_date', 'exe_s_date', 'func_date'];

function versionNo(v) {
  const m = /^v(\d+)/i.exec(String(v ?? ''));
  return m ? Number(m[1]) : null;
}

// 擷取日：captured_at_local 或 captured_at 的日期部分
function capturedDate(b) {
  for (const s of [b.captured_at_local, b.captured_at]) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
    if (m) {
      const d = validIso(+m[1], +m[2], +m[3]);
      if (d) return d;
    }
  }
  return null;
}

// 性別與年齡：身分列「…民 YY/MM/DD男」；生日只用於計算，不回傳
function sexAge(tabs, ref) {
  for (const t of tabs) {
    const m = /民\s*(\d{2,3})\/(\d{1,2})\/(\d{1,2})\s*(男|女)/.exec(typeof t?.page_text === 'string' ? t.page_text : '');
    if (!m) continue;
    const y = +m[1] + 1911, mo = +m[2], d = +m[3];
    if (!validIso(y, mo, d)) continue;
    const [ry, rm, rd] = ref.split('-').map(Number);
    const age = ry - y - (rm < mo || (rm === mo && rd < d) ? 1 : 0);
    return { sex: m[4] === '男' ? 'M' : 'F', age: age >= 0 ? age : null };
  }
  return { sex: null, age: null };
}

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

export function parseBundle(b) {
  const fail = (error) => ({ ok: false, error });
  if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.schema !== 'string') return fail(ERR.notBundle);
  if (/^nhi-harvest\/[12]$/.test(b.schema)) return fail(ERR.oldSchema);
  if (b.schema !== SCHEMA) return fail(ERR.unsupported);
  if (!Array.isArray(b.tabs)) return fail(ERR.incomplete);
  const ref = capturedDate(b);
  if (!ref) return fail(ERR.incomplete);

  const warnings = [];
  const v = versionNo(b.harvester_version);
  if (v !== null && v > MAX_KNOWN_VERSION) warnings.push(`書籤版本 v${v} 較新；本工具依 v5–v7 設計，帶入結果請特別核對。`);

  const out = { ok: true, warnings, ref, ...sexAge(b.tabs, ref), labs: [], drugs: [], dx: [], procs: [], counts: { rows: 0, dupRows: 0, badDates: 0 } };
  const seen = new Set();
  for (const t of b.tabs) {
    for (const tb of Array.isArray(t?.tables) ? t.tables : []) {
      for (const r of Array.isArray(tb?.rows) ? tb.rows : []) {
        const d = r?.data;
        if (!d || typeof d !== 'object') continue;
        const kind = kindOf(d);
        const { r: _rowNo, ...rest } = d;
        const key = kind + JSON.stringify(rest);
        if (seen.has(key)) { out.counts.dupRows++; continue; }
        seen.add(key);
        out.counts.rows++;
        const dk = DATE_KEYS.find((k) => k in d && str(d[k]));
        const date = dk ? rocToIso(d[dk]) : null;
        if (dk && !date) out.counts.badDates++;
        if (kind === 'lab') {
          if (date) out.labs.push({ date, code: str(d.order_code).toUpperCase(), item: str(d.assay_item_name), unit: str(d.unit_data), ...cleanNumber(d.assay_value) });
        } else if (kind === 'drug') {
          const days = Number(str(d.day));
          if (date) out.drugs.push({ date, code: str(d.drug_code).toUpperCase(), atc: str(d.drug_atc7_code).toUpperCase(), ing: str(d.drug_ing_name), name: str(d.drug_ename), fre: str(d.drug_fre).replace(/\s+/g, ' '), qty: str(d.qty), days: Number.isFinite(days) && days > 0 ? days : 0 });
        } else if (kind === 'material' || kind === 'procedure') {
          const name = [d.met_c_name, d.met_e_name, d.order_ename, d.order_name].map(str).filter(Boolean).join(' ');
          if (date && name) out.procs.push({ date, kind, name, code: str(d.order_code) });
        }
        const icd = 'icd_code' in d ? normIcd(d.icd_code) : null;
        if (icd && date) out.dx.push({ code: icd, date, source: SOURCE_LABEL[kind] });
      }
    }
  }
  return out;
}

export function parseText(text) {
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    return { ok: false, error: ERR.notJson };
  }
  return parseBundle(b);
}
