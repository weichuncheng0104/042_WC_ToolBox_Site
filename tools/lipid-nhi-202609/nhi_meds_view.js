// 健保雲端帶入的降脂用藥（S25）與判讀所用資料（S27）：帶入狀態（只在頁面記憶體）＋預覽／結果卡共用的表格。
// 狀態由 nhi_import_ui.js 在「帶入」時設定、「清除帶入資料」「清空重評」「換檔」時清掉；ui.js 讀取以顯示並寫入病歷用摘要。
// 狀態：{ meds, recent, ldl, firstC10, ref, items（已帶入的建議） } 或 null（無帶入）
import { firstC10Text, basisLine } from './nhi_import_rules.js';

let imported = null;
export const setImported = (x) => { imported = x; };
export const importedData = () => imported;
export const importedMeds = () => (imported ? imported.meds : null);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const COLS = ['學名（成分）', '商品名', '健保代碼', '含量', '頻次', '總量', '給藥天數', '處方日', '清單屬性'];

function table(rows) {
  const t = el('table', 'nhi-meds');
  const hr = el('tr');
  for (const c of COLS) hr.append(el('th', '', c));
  t.append(hr);
  for (const x of rows) {
    const tr = el('tr');
    for (const v of [x.ing, x.name, x.code, x.strength, x.fre, x.qty, x.days ? `${x.days} 天` : '', x.date, x.listing.label]) tr.append(el('td', '', v || '—'));
    t.append(tr);
  }
  return t;
}

// 目前用藥含 2.6.1 僅表二品項時的提示。tableChoice：預覽（尚未帶入）→ undefined；結果卡 → 評估時的適用表選項
const BOTH = '評估結果並列表二（續用目前品項）與表一（評估改用非清單品項）。';
export function t2Hint(tableChoice) {
  const head = '目前用藥含 2.6.1 僅適用表二品項：';
  if (tableChoice === undefined) return `${head}適用表不帶入、維持目前選擇；選「不確定」時${BOTH}`;
  if (tableChoice === 'unsure') return `${head}適用表為「不確定」，${BOTH}`;
  return `${head}適用表目前不是「不確定」，結果未並列表一、表二；如需並列請改選「不確定」後重新評估。`;
}

// meds：lipidMeds() 結果 → 區塊元素
export function medsBlock(meds, tableChoice) {
  const b = el('div', 'nhi-medsblock');
  if (!meds.current.length && !meds.previous.length) {
    b.append(el('p', 'hint', `資料窗內（擷取日 ${meds.ref}）無降血脂藥（ATC C10）處方。`));
    return b;
  }
  b.append(el('p', 'nhi-sub', `目前降脂用藥（最近一次降脂處方日 ${meds.lastDate}；擷取日 ${meds.ref}）`), table(meds.current));
  if (meds.current.some((x) => x.listing.key === 't2')) {
    b.append(el('p', 'emph', t2Hint(tableChoice)));
  }
  if (meds.previous.length) b.append(el('p', 'nhi-sub', '先前降脂用藥（資料窗內，每品項列最近一次處方）'), table(meds.previous));
  b.append(el('p', 'hint', '含量取自商品名；清單屬性查給付規定 2.6 列舉清單（同「藥品查詢」）。資料窗有限（用藥約 6 個月），請核對病人實際用藥。'));
  return b;
}

// S27 結果卡「判讀所用資料」：basis＝importBasis() 結果 → 區塊元素（帶入值附來源；帶入後改過標「手動」；LDL-C 歷次）
export function basisBlock(basis) {
  const b = el('div', 'nhi-basis');
  b.append(el('p', 'hint', `擷取日 ${basis.ref}；只列目前這個 .json 帶入的欄位，其他欄位為手動填寫。`));
  const ul = el('ul', 'items');
  if (!basis.used.length) ul.append(el('li', '', '無帶入欄位'));
  for (const u of basis.used) ul.append(el('li', '', basisLine(u))); // S28 簡潔格式，與病歷用摘要一致
  b.append(ul, el('p', 'nhi-sub', `LDL-C 歷次（資料窗內；${firstC10Text(basis.firstC10)}）`));
  if (!basis.ldl.length) b.append(el('p', 'hint', '資料窗內無 LDL-C 檢驗。'));
  else {
    const t = el('table', 'nhi-meds');
    const hr = el('tr');
    for (const c of ['檢驗日', 'LDL-C（mg/dL）']) hr.append(el('th', '', c));
    t.append(hr);
    for (const x of basis.ldl) {
      const tr = el('tr');
      tr.append(el('td', '', x.date), el('td', '', x.value === null ? '無法判讀' : String(x.value)));
      t.append(tr);
    }
    b.append(t);
  }
  return b;
}
