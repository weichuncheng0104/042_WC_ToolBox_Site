// 「查可用藥物」獨立頁：statin 強度參考表＋給付規定 2.6 藥品查詢。只顯示類別與出處，不讀也不寫評估工具的病人資料。
import { TOOLS } from '../../tools.js';
import { renderHeader, renderFooter } from '../../common/layout.js';
import { renderPendingNotice } from '../../common/pending.js';
import { lookupDrug, infoOf, NOT_FOUND_TEXT, COVERAGE_NOTE } from './drug_lookup.js';
import { STATIN_INTENSITY } from './statin_intensity.js';

const tool = TOOLS.find((t) => t.id === 'lipid-nhi-202609');
renderHeader('../../');
const back = document.createElement('a');
back.href = 'index.html';
back.textContent = '← 返回評估工具';
document.querySelector('.site-header .title').before(back);
renderFooter({ regulation: tool.regulation, officialUrl: tool.officialUrl, lastUpdate: tool.lastUpdate });
renderPendingNotice(tool);

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// statin 強度參考表（Washington Manual 2022 Table 3-10）
const S = STATIN_INTENSITY;
const box = el('div', 'ref');
const t = el('table');
const hr = el('tr');
for (const h of ['強度', '預期降幅', '藥物與每日劑量']) hr.append(el('th', '', h));
t.append(hr);
for (const r of S.rows) {
  const tr = el('tr');
  tr.append(el('td', '', r.level), el('td', '', r.ldlDrop), el('td', '', r.drugs.join('、')));
  t.append(tr);
}
box.append(t, el('p', 'hint', S.note), el('span', 'cite', `〔出處：${S.cite}〕`));
$('intensity').append(el('h2', '', `${S.title}`), el('p', 'emph', '教科書參考，非健保定義：給付規定未定義 statin 強度劑量。'), box);

// 藥品查詢：只列類別說明與出處
const MAX_HITS = 30;
function show() {
  const out = $('drug-q-out');
  out.replaceChildren();
  const q = $('drug-q').value;
  if (!q.trim()) return;
  const hits = lookupDrug(q);
  if (!hits.length) {
    out.append(el('p', 'emph', NOT_FOUND_TEXT));
  } else {
    const ul = el('ul', 'items');
    for (const d of hits.slice(0, MAX_HITS)) {
      const li = el('li');
      li.append(el('b', '', d.name), `（${d.code}）：${infoOf(d).label}`, el('span', 'cite', `〔${d.cite}〕`));
      ul.append(li);
    }
    out.append(el('p', '', `找到 ${hits.length} 筆。`), ul);
    if (hits.length > MAX_HITS) out.append(el('p', 'hint', `只列前 ${MAX_HITS} 筆；請輸入更完整的藥名或代碼。`));
  }
  out.append(el('p', 'hint', COVERAGE_NOTE));
}
$('drug-q-btn').addEventListener('click', show);
$('drug-q').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); show(); }
});
