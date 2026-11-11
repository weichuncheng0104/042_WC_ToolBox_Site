// 參考頁共用的表格：藥品清單表（完整藥物清單頁、表一／表二專用頁）、statin 強度表（查可用藥物頁、強度專用頁）。只顯示。
import { grouped, MARK_LABEL } from './drug_list_view.js';
import { STATIN_INTENSITY as S } from './statin_intensity.js';

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function drugTable(items) {
  const t = el('table', 'dl');
  const hr = el('tr');
  for (const h of ['學名（成分）', '商品名（英／中）', '健保代碼', '規格', '清單標記']) hr.append(el('th', '', h));
  t.append(hr);
  for (const g of grouped(items)) {
    const gr = el('tr');
    const th = el('th', 'grp', `${g.generic}（${g.items.length}）`);
    th.colSpan = 5;
    gr.append(th);
    t.append(gr);
    for (const d of g.items) {
      const tr = el('tr');
      const name = el('td', '', d.en);
      if (d.zh) name.append(el('br'), d.zh);
      const marks = el('td');
      for (const m of d.marks) marks.append(el('span', 'mk', MARK_LABEL[m]));
      if (d.chapter) marks.append(el('span', 'cite', `章節 ${d.chapter}`));
      tr.append(el('td', '', d.ingredient), name, el('td', 'code', d.code), el('td', '', d.spec), marks);
      t.append(tr);
    }
  }
  const wrap = el('div', 'dl-wrap');
  wrap.append(t);
  return wrap;
}

// statin 強度參考表（Washington Manual 2022 Table 3-10）
export function intensitySection(box) {
  const ref = el('div', 'ref');
  const t = el('table');
  const hr = el('tr');
  for (const h of ['強度', '預期降幅', '藥物與每日劑量']) hr.append(el('th', '', h));
  t.append(hr);
  for (const r of S.rows) {
    const tr = el('tr');
    tr.append(el('td', '', r.level), el('td', '', r.ldlDrop), el('td', '', r.drugs.join('、')));
    t.append(tr);
  }
  ref.append(t, el('p', 'hint', S.note), el('span', 'cite', `〔出處：${S.cite}〕`));
  box.append(el('h2', '', S.title), el('p', 'emph', '教科書參考，非健保定義：給付規定未定義 statin 強度劑量。'), ref);
}
