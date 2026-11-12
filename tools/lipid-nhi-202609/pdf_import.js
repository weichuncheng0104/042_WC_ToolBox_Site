// 成大三個月資料摘要 PDF 帶入（spec/lipid-nhi-202609/pdf_import.md；純函式、無依賴 DOM、不發網路請求、不寫儲存）。
// parseNckuhPages() 結果 → parseBundle() 同構的資料（只有檢驗、性別、年齡；用藥、診斷一律空）→ buildProposals() → 依 PDF 規則修正。
// PDF 沒有用藥與診斷：不產生任何依用藥或診斷推算的欄位（「沒出現」不等於「沒有」）。
import { buildProposals } from './nhi_import_rules.js';

// PDF 項目代號 → 健保醫令碼（沿用 JSON 的檢驗規則）；空腹血糖只認 GLU, AC
const CODE = { 'LDL-C': '09044C', 'HDL-C': '09043C', CHOL: '09001C', TG: '09004C', 'GLU, AC': '09005C' };
const EGFR = ['eGFR(CKD-EPI)', 'eGFR']; // Q-P2：每日優先 CKD-EPI，當日沒有才取 eGFR
const ALLOWED = new Set(['sex', 'age', 'hdl', 'tc', 'tg', 'fpg', 'ldl', 'ckd_predialysis']);
export const PDF_NOTE_LDL = 'PDF 無用藥資料，無法判斷是否為用藥前基線；若已用藥請改填目前 LDL-C';
export const PDF_NO_RX = 'PDF 無用藥與診斷資料：降血脂用藥、糖尿病／高血壓用藥、心血管與其他診斷相關欄位請手動填寫。';

const row = (l, code) => ({ date: l.date, code, item: l.item, unit: '', raw: l.raw, value: l.value, ...(l.qual ? { qual: l.qual } : {}), ...(l.flag ? { flag: l.flag } : {}) });
const shown = (l) => `${l.flag ? `${l.flag} ` : ''}${l.raw}（${l.date}）`; // H／L 旗標只顯示（spec §2）

export function toBundle(r) {
  if (!r || !r.ok) return r;
  const labs = r.labs.filter((l) => CODE[l.item]).map((l) => row(l, CODE[l.item]));
  for (const d of [...new Set(r.labs.filter((l) => EGFR.includes(l.item)).map((l) => l.date))]) {
    for (const name of EGFR) {
      const rows = r.labs.filter((l) => l.date === d && l.item === name);
      if (rows.length) { labs.push(...rows.map((l) => row(l, '09015C'))); break; }
    }
  }
  return { ok: true, source: 'pdf', warnings: [], ref: r.ref, sex: r.sex, age: r.age, labs, hba1c: r.labs.filter((l) => l.item === 'HbA1c'), egfr: r.labs.filter((l) => EGFR.includes(l.item)),
    drugs: [], dx: [], procs: [], counts: { rows: r.labs.length, dupRows: 0, badDates: 0 } };
}

export function buildPdfProposals(b) {
  const p = buildProposals(b);
  const items = p.items.filter((it) => ALLOWED.has(it.field)).map((it) => {
    if (it.field === 'sex') return { ...it, source: '成大 PDF 頁首', brief: 'PDF 頁首' };
    if (it.field === 'age') return { ...it, kind: 'direct', source: `成大 PDF 頁首年齡（院方列印時；資料窗迄日 ${b.ref}）`, brief: 'PDF 頁首' };
    if (it.field === 'fpg') {
      const note = (it.note || '').split('；').filter((x) => x !== '資料未註明是否空腹').join('；');
      const { note: _n, ...rest } = it;
      return { ...rest, kind: 'direct', ...(note ? { note } : {}) };
    }
    if (it.field === 'ldl') {
      const note = [PDF_NOTE_LDL, ...(it.note || '').split('；').filter((x) => x && !/降血脂藥處方/.test(x))].join('；');
      return { ...it, note, defaultOff: true }; // Q-P1：預設不勾
    }
    return it;
  });
  // 參考區：eGFR 改列資料窗內全部數值與日期（spec §2；取代共用規則的「最近一筆」）
  const info = [{ label: '用藥與診斷', text: PDF_NO_RX }, ...p.info.filter((x) => x.label !== 'eGFR')];
  if (b.egfr.length) info.push({ label: 'eGFR', text: `${b.egfr.map((l) => `${l.item} ${shown(l)}`).join('、')}；CKD 判讀每日優先取 eGFR(CKD-EPI)，只供參考，不直接帶入。` });
  if (!b.labs.some((l) => ['09044C', '09043C', '09001C', '09004C'].includes(l.code))) info.unshift({ label: '血脂', text: '資料窗內無血脂檢驗。' });
  if (b.hba1c.length) info.push({ label: 'HbA1c', text: `${b.hba1c.map(shown).join('、')}；只供參考，不直接帶入。` });
  return { ...p, items, info, source: 'pdf', firstC10: null, recent: false, meds: { ...p.meds, unavailable: true } };
}
