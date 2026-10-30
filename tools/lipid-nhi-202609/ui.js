// 點選 UI：讀表單 → engine.evaluate() → 顯示。病人資料只在頁面記憶體，不寫 localStorage／cookie、不送出。
import { TOOLS } from '../../tools.js';
import { renderHeader, renderFooter } from '../../common/layout.js';
import { evaluate } from './engine.js';
import { lookupDrug, infoOf, NOT_FOUND_TEXT, COVERAGE_NOTE } from './drug_lookup.js';
import { chartSummary } from './summary.js';
import { clearRadios, linkHofh } from './tristate.js';
import { readFields, resetFields, syncMeno, syncDisabled } from './form_state.js';

const tool = TOOLS.find((t) => t.id === 'lipid-nhi-202609');
document.getElementById('tool-name').textContent = tool.name;
renderHeader('../../');
renderFooter({ regulation: tool.regulation, officialUrl: tool.officialUrl });

const form = document.getElementById('f');
const out = document.getElementById('result');
const $ = (id) => document.getElementById(id);

const readForm = () => readFields(form);

// ── 即時：自動判定欄位、子項展開、較高層級鎖定 ──
function setAuto(id, met) {
  const box = $(id);
  if (!box) return;
  box.checked = met === true;
  box.indeterminate = met === null;
  const tag = box.parentElement.querySelector('.tag-auto');
  if (tag) tag.textContent = met === null ? '無法自動判定（缺性別／年齡）' : '自動判定';
}

function refresh() {
  syncMeno(form, readForm().sex);
  const x = readForm();
  for (const d of form.querySelectorAll('.subs[data-parent]')) d.hidden = !x[d.dataset.parent];

  const r = evaluate(x);
  const tc = Number(x.tc), hdl = Number(x.hdl);
  $('v-nonhdl').textContent = x.tc !== null && x.hdl !== null ? `${tc - hdl} mg/dL` : '—';
  $('v-ratio').textContent = r.tg && r.tg.ratio !== null ? r.tg.ratio : x.tc !== null && x.hdl !== null && hdl > 0 ? (tc / hdl).toFixed(2) : '—';

  const ldl = Number(x.ldl);
  setAuto('a-ldl190', x.ldl !== null && ldl >= 190);
  const t1 = r.table1;
  if (t1) {
    for (const f of t1.rf) setAuto(`a-${f.ruleId}`, f.met);
    $('v-mets').textContent = t1.mets.count;
    $('v-mets-items').textContent = t1.mets.items.map((m) => `${m.ruleId} ${m.met === true ? '✓' : m.met === null ? '?' : '✗'}`).join('　');
  }
  const locked = t1 ? t1.lockedSections : [];
  for (const fs of form.querySelectorAll('fieldset[data-sec]')) fs.classList.toggle('locked', locked.includes(fs.dataset.sec));
  // Q14 路徑 II：statin 禁忌症／不耐受 → 此題不必回答，停用並註明
  const pathII = syncDisabled(form, x, locked);
  $('q14-row').classList.toggle('off', pathII);
  $('q14-pathii').hidden = !pathII;
}

// ── 結果卡 ──
const STATUS = {
  eligible: ['符合', 'ok'], eligible_lifestyle_first: ['符合（給藥前應有 3–6 個月生活型態改變）', 'warn'], not_yet: ['尚不符合', 'warn'], not_eligible: ['不符合', 'no'], forbidden: ['不得併用', 'no'],
  conditional: ['視品項而定', 'warn'], undetermined: ['本工具無法判定', 'fl'],
  need_ldl: ['需 LDL-C 才能判定', 'fl'], no_article: ['給付規定無專條', 'fl'],
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function badge(status) {
  const [t, c] = STATUS[status] || [status, ''];
  return el('span', `st st-${c}`, t);
}
function line(it) {
  const li = el('li', it.emphasis ? 'emph' : '');
  if (it.auto) li.append(el('span', 'tag-auto', '自動判定'), ' ');
  li.append(it.text);
  if (it.missingSource) li.append(' ', el('span', 'tag-gap', '原文缺口'));
  li.append(el('span', 'cite', `〔${it.ruleId}｜${it.cite}〕`));
  if (it.reference === 'statin_intensity') li.append(' ', el('span', 'hint', 'statin 強度參考表（非健保定義）見「查可用藥物」。'));
  return li;
}
// 「查可用藥物」：新分頁開 drugs.html；不帶任何網址參數（病人資料不離開本頁）
function drugsButton() {
  const a = el('a', 'btn', '查可用藥物');
  a.href = 'drugs.html';
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}
function list(items) {
  const ul = el('ul', 'items');
  for (const it of items) ul.append(line(it));
  return ul;
}
function block(title) {
  const s = el('div', 'rblock');
  s.append(el('h3', '', title));
  out.append(s);
  return s;
}
function citeLine(text, cite) {
  const p = el('p');
  p.append(text, el('span', 'cite', `〔${cite}〕`));
  return p;
}

function renderTargets(b, tg) {
  const p = el('p');
  p.append('LDL-C 目標：', el('b', '', tg.ldl.text || '—'));
  if (tg.ldl.met !== null && tg.ldl.met !== undefined) p.append(`（目前 ${tg.ldl.current}：${tg.ldl.met ? '已達標' : '未達標'}）`);
  if (tg.ldl.cite) p.append(el('span', 'cite', `〔${tg.ldl.ruleId}｜${tg.ldl.cite}〕`));
  b.append(p);
  if (tg.nonhdl) {
    const q = el('p');
    q.append('non-HDL-C 目標：', el('b', '', tg.nonhdl.text));
    if (tg.nonhdl.calc !== null && tg.nonhdl.calc !== undefined) q.append(`（計算值 ${tg.nonhdl.calc}${tg.nonhdl.met === null ? '' : tg.nonhdl.met ? '，已達標' : '，未達標'}）`);
    if (tg.nonhdl.cite) q.append(el('span', 'cite', `〔${tg.nonhdl.ruleId}｜${tg.nonhdl.cite}〕`));
    b.append(q);
  }
  if (tg.tc && tg.tc.value !== null) b.append(citeLine(`TC：${tg.tc.text}${tg.tc.met === null ? '' : tg.tc.met ? '（已達）' : '（未達）'}`, `${tg.tc.ruleId}｜${tg.tc.cite}`));
}

function render(r) {
  out.replaceChildren();
  out.hidden = false;
  out.append(el('h2', '', '評估結果'));
  block('適用表').append(list(r.scope));

  const t1 = r.table1;
  if (t1) {
    const b = block('表一｜風險層級與依據');
    const h = el('p', 'tier');
    h.append(el('b', '', t1.tier.label));
    if (t1.tier.status !== 'ok') h.append(' ', badge('undetermined'));
    b.append(h);
    if (t1.tier.reason) b.append(citeLine(t1.tier.reason.text, t1.tier.reason.cite));
    if (t1.tier.basis.length) b.append(list(t1.tier.basis));
    if (t1.notes.length) b.append(list(t1.notes));

    const g = block('表一｜給付判定');
    const e = t1.eligibility;
    const gp = el('p');
    gp.append(badge(e.status), ' ', e.text, el('span', 'cite', `〔${e.ruleId}｜${e.cite}〕`));
    g.append(gp);
    if (t1.nonPharm) g.append(citeLine(`非藥物治療：${t1.nonPharm.text}`, `${t1.nonPharm.ruleId}｜${t1.nonPharm.cite}`));
    if (t1.targets.ldl.value !== null) renderTargets(g, t1.targets);
  }

  const t2 = r.table2;
  if (t2) {
    const b = block('表二（2.6.1 總則所列品項）');
    b.append(citeLine(`病人類別：${t2.row.label}（表二危險因子 ${t2.rfCount} 項）`, `${t2.row.id ?? 'TOOL-NOSEX'}｜${t2.row.cite}`));
    const gp = el('p');
    gp.append(badge(t2.eligibility.status), ' ', t2.eligibility.text, el('span', 'cite', `〔${t2.eligibility.ruleId}｜${t2.eligibility.cite}〕`));
    b.append(gp);
    if (t2.nonPharm) b.append(citeLine(`非藥物治療：${t2.nonPharm.text}`, `${t2.nonPharm.ruleId}｜${t2.nonPharm.cite}`));
    if (t2.targets.ldl.value !== null) renderTargets(b, t2.targets);
    if (t2.notes.length) b.append(list(t2.notes));
    b.append(list(t2.followUp));
  }

  const d = block('可選藥物與給付條件');
  const dp = el('p');
  dp.append(drugsButton(), ' ', el('span', 'hint', 'statin 強度參考、給付規定 2.6 藥品代碼／藥名查詢（新分頁）'));
  d.append(dp);
  for (const dr of r.drugs) {
    const c = el('div', 'drug');
    const head = el('p', 'dname');
    head.append(el('b', '', dr.name), ' ', badge(dr.status));
    if (dr.preapproval) head.append(' ', el('span', 'tag-pre', '需事前審查（附表二-D）'));
    c.append(head);
    if (dr.items.length) c.append(list(dr.items));
    d.append(c);
  }

  if (t1 && t1.followUp.length) block('追蹤建議（表一處方規定、評估建議）').append(list(t1.followUp));

  if (r.tg) {
    const b = block('降三酸甘油酯藥物給付規定表');
    b.append(el('p', '', `TG ${r.tg.tg} mg/dL；TC/HDL-C ${r.tg.ratio ?? '—'}`));
    for (const row of r.tg.rows) {
      const p = el('p');
      p.append(badge(row.status), ` ${row.label}：起始 ${row.startText}；目標 ${row.target}；${row.nonPharm}`, el('span', 'cite', `〔${row.id}｜${row.cite}〕`));
      b.append(p);
    }
    b.append(list([...r.tg.notes, ...r.tg.followUp]));
  }

  out.append(el('p', 'meta', `${r.meta.regulation}｜${r.meta.effective}｜${r.meta.snapshot}。出處 F＝健保署完整給付規定 PDF 頁碼。`));
  renderChart(r);
  out.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 病歷用純文字摘要：只在本機剪貼簿，不送出
function renderChart(r) {
  const b = block('病歷用摘要（純文字，可貼回病歷）');
  b.classList.add('chart');
  const ta = el('textarea');
  ta.readOnly = true;
  ta.value = chartSummary(r);
  ta.rows = ta.value.split('\n').length + 1;
  const btn = el('button', 'btn', '複製');
  btn.type = 'button';
  const msg = el('span', 'hint');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      msg.textContent = '已複製';
    } catch {
      ta.focus();
      ta.select();
      msg.textContent = '無法自動複製：已選取文字，請按 Ctrl+C（手機長按）複製';
    }
  });
  const row = el('p');
  row.append(btn, ' ', drugsButton(), ' ', msg);
  b.append(ta, row);
}

// ── 藥品代碼查詢：一筆 → 自動帶入；多筆 → 逐筆「帶入」 ──
const MAX_HITS = 30;
const FIELD_LABEL = { table_choice: '0 適用表', eze_listed: '7 ezetimibe 是否為 2.6.2 清單品項', cmb_listed: '7 複方是否為 2.6.3 清單品項' };

function applyDrug(d) {
  const { field, value } = infoOf(d);
  const radio = form.querySelector(`input[name="${field}"][value="${value}"]`);
  radio.checked = true;
  refresh();
  return `已帶入：${FIELD_LABEL[field]}＝${radio.parentElement.textContent.trim()}（${d.name}）`;
}

function showDrugs() {
  const box = $('drug-q-out');
  box.replaceChildren();
  const q = $('drug-q').value;
  if (!q.trim()) return;
  const hits = lookupDrug(q);
  if (!hits.length) {
    box.append(el('p', 'emph', NOT_FOUND_TEXT));
  } else {
    const msg = el('p', 'emph');
    const ul = el('ul', 'items');
    for (const d of hits.slice(0, MAX_HITS)) {
      const li = el('li');
      li.append(el('b', '', d.name), `（${d.code}）：${infoOf(d).label}`, el('span', 'cite', `〔${d.cite}〕`));
      if (hits.length > 1) {
        const b = el('button', '', '帶入');
        b.type = 'button';
        b.addEventListener('click', () => { msg.textContent = applyDrug(d); });
        li.append(' ', b);
      }
      ul.append(li);
    }
    box.append(ul);
    if (hits.length > MAX_HITS) box.append(el('p', 'hint', `共 ${hits.length} 筆，只列前 ${MAX_HITS} 筆；請輸入更完整的藥名或代碼。`));
    if (hits.length === 1) msg.textContent = applyDrug(hits[0]);
    else msg.textContent = `找到 ${hits.length} 筆，請按「帶入」選擇品項。`;
    box.append(msg);
  }
  box.append(el('p', 'hint', COVERAGE_NOTE));
}

$('drug-q-btn').addEventListener('click', showDrugs);
$('drug-q').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') { ev.preventDefault(); showDrugs(); }
});

// 第 7 區「診斷：HoFH」→ 第 8 區「已確診」帶入（須在 refresh 之前）；hofhAuto＝目前值為自動帶入且未手動改過
let hofhAuto = false;
form.addEventListener('change', (ev) => {
  if (ev.target.name === 'dx_hofh') hofhAuto = linkHofh(form, ev.target.checked, hofhAuto);
});
// 手動點「已確診」即視為手動作答；用 click 而非 change，因再點已選的同一值不會發出 change
form.addEventListener('click', (ev) => {
  if (ev.target.name === 'hofh_dx_confirmed') hofhAuto = false;
});
for (const b of form.querySelectorAll('button[data-clear]')) {
  b.addEventListener('click', () => {
    clearRadios(form, b.dataset.clear);
    if (b.dataset.clear === 'hofh_dx_confirmed') hofhAuto = false;
    refresh();
  });
}

form.addEventListener('input', refresh);
form.addEventListener('change', refresh);
form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  render(evaluate(readForm()));
});
// 「重新評估」：整份表單回到初始狀態（所有欄位、藥品查詢結果、HoFH 連動、結果卡與病歷摘要），再重算停用狀態
function resetAll() {
  resetFields(form);
  hofhAuto = false;
  $('drug-q-out').replaceChildren();
  out.replaceChildren();
  out.hidden = true;
  refresh();
  window.scrollTo({ top: 0 });
}
$('reset').addEventListener('click', resetAll);
refresh();
