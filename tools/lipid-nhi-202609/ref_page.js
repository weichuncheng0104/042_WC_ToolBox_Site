// 專用參考頁（S30）：表一／表二＝規定表＋適用藥物清單；si＝statin 強度表；l2／l3＝2.6.2／2.6.3 清單品項、art＝2.6 全文（S36）。不讀病人資料、不載入外部資源。
import { TOOLS } from '../../tools.js';
import { renderHeader, renderFooter } from '../../common/layout.js';
import { renderPendingNotice } from '../../common/pending.js';
import { DRUG_LIST } from './drug_list.js';
import { matches, sections, sourceLine } from './drug_list_view.js';
import { TABLE1, TABLE2 } from './rule_tables.js';
import { el, drugTable, intensitySection } from './ref_views.js';
import { DRUG_CODES } from './drug_codes.js';
import { ARTICLES, LIST_REF, TOP_HEADING } from './articles.js';
import { articleBlocks } from './articles_view.js';
import { REFS, installRefPopup } from './ref_links.js';

const tool = TOOLS.find((t) => t.id === 'lipid-nhi-202609');
renderHeader('../../');
renderFooter({ regulation: tool.regulation, officialUrl: tool.officialUrl, lastUpdate: tool.lastUpdate });
renderPendingNotice(tool);

const main = document.querySelector('main');
const sec = () => { const s = el('section', 'sec'); main.append(s); return s; };

function ruleSection(T) {
  const s = sec();
  s.append(el('h2', '', T.title), el('p', 'hint', `${T.note || ''}依健保署給付規定原文；以健保署公告為準。`));
  const t = el('table', 'dl rule-t');
  const hr = el('tr');
  for (const c of T.columns) hr.append(el('th', '', c));
  t.append(hr);
  for (const r of T.rows) {
    const tr = el('tr');
    for (const v of [r.risk, r.nonPharm, r.start, r.target]) tr.append(el('td', '', v));
    t.append(tr);
  }
  const wrap = el('div', 'dl-wrap');
  wrap.append(t);
  s.append(wrap, el('span', 'cite', `〔${T.cite}〕`));
  for (const x of T.sections) {
    s.append(el('h3', '', x.heading));
    for (const p of x.paras) s.append(el('p', 'rule-para', p));
    s.append(el('span', 'cite', `〔${x.cite}〕`));
  }
}

function drugSection(id) {
  const S = sections(DRUG_LIST).find((x) => x.id === id);
  const s = sec();
  const title = el('h2');
  const label = el('label', 'num', '篩選（健保代碼、學名、商品名）');
  const q = el('input');
  q.type = 'search';
  q.autocomplete = 'off';
  label.append(q);
  const box = el('div');
  s.append(title, el('p', 'hint', `資料版本：${sourceLine(DRUG_LIST.source)}`), label, box);
  const render = () => {
    const hits = S.items.filter((d) => matches(d, q.value));
    title.textContent = `${S.title}：${hits.length}${q.value.trim() ? `／${S.items.length}` : ''} 筆`;
    box.replaceChildren(hits.length ? drugTable(hits) : el('p', 'hint', '無符合品項。'));
  };
  q.addEventListener('input', render);
  render();
}

// 2.6.2／2.6.3 清單品項頁（S36）：條文但書＋用藥品項檔中該清單品項（欄位同表一／表二頁）
function listPage(cat) {
  const a = ARTICLES.find((x) => x.list === cat);
  const codes = DRUG_CODES.filter((d) => d.category === cat);
  const items = DRUG_LIST.items.filter((d) => d.marks.includes(cat));
  const s = sec();
  s.append(el('h2', '', a.heading), el('p', 'rule-para', a.paras[a.paras.length - 1]), el('span', 'cite', `〔${a.cite}〕`));
  const d = sec();
  d.append(el('h2', '', `清單品項：${codes.length} 個代碼`), el('p', 'hint', `資料版本：${sourceLine(DRUG_LIST.source)}`), drugTable(items));
  const missing = codes.filter((c) => !items.some((x) => x.code === c.code));
  if (missing.length) d.append(el('p', 'emph', `用藥品項檔查無有效品項（本工具無法列出成分與商品名，請查原文）：${missing.map((c) => `${c.code} ${c.name}`).join('、')}`));
}

// 「看條文」頁（S36）：給付規定 2.6 全文（逐字）；品項清單只列原文的代碼與藥名
const INDENT = [[/^\((\d+)\)/, 1], [/^(I|II)\. /, 2], [/^(i|ii|iii|iv)\. /, 3]];
const indent = (p) => (INDENT.find(([re]) => re.test(p)) || [null, 0])[1];
function paras(box, list) {
  for (const p of list || []) {
    const e = el('p', 'rule-para', p);
    const n = indent(p);
    if (n) e.style.marginLeft = `${n * 1.2}em`;
    box.append(e);
  }
}
function textSection(T) {
  const s = sec();
  s.append(el('h2', '', T.heading));
  paras(s, T.paras);
  s.append(el('span', 'cite', `〔${T.cite}〕`));
}
function codeTable(a, codes) {
  const det = el('details');
  det.append(el('summary', '', `下表所列項目（${codes.length} 個代碼）`));
  const t = el('table', 'dl');
  const hr = el('tr');
  for (const h of ['健保代碼', '藥品名稱']) hr.append(el('th', '', h));
  t.append(hr);
  let g;
  for (const d of codes) {
    if (d.group && d.group !== g) {
      g = d.group;
      const th = el('th', 'grp', g);
      th.colSpan = 2;
      const tr = el('tr');
      tr.append(th);
      t.append(tr);
    }
    const tr = el('tr');
    tr.append(el('td', 'code', d.code), el('td', '', d.name));
    t.append(tr);
  }
  const wrap = el('div', 'dl-wrap');
  wrap.append(t);
  const r = REFS[a.listRef];
  const link = el('a', 'ref-link', '成分、中英文商品名、規格（用藥品項檔）');
  link.href = r.href;
  link.target = r.win;
  det.append(wrap, link);
  return det;
}
function articlesPage() {
  const top = sec();
  top.append(el('h2', '', TOP_HEADING),
    el('p', 'hint', '條文逐字轉錄自健保署完整給付規定（115/10/22 更新版）；表一、表二、降三酸甘油酯表依原表欄位重排，品項清單可展開。正式內容以健保署公告為準。'));
  const nav = el('p');
  for (const a of ARTICLES) {
    const l = el('a', '', a.id);
    l.href = `#a-${a.id}`;
    nav.append(l, '　');
  }
  top.append(nav);
  for (const b of articleBlocks()) {
    if (b.kind === 'table') { ruleSection(b.T); continue; }
    if (b.kind === 'text') { textSection(b.T); continue; }
    const { a } = b;
    const s = sec();
    s.id = `a-${a.id}`;
    s.append(el('h2', '', a.heading));
    paras(s, a.paras);
    if (b.codes.length) s.append(codeTable(a, b.codes));
    paras(s, a.after);
    s.append(el('span', 'cite', `〔${a.cite}〕`));
  }
}

const ref = document.body.dataset.ref;
if (ref === 't1') { ruleSection(TABLE1); drugSection('table1'); }
else if (ref === 't2') { ruleSection(TABLE2); drugSection('table2'); }
else if (LIST_REF[ref]) listPage(LIST_REF[ref]);
else if (ref === 'art') { articlesPage(); installRefPopup(); }
else intensitySection(sec());
