// 健保雲端 .json 上傳 → 帶入預覽 → 勾選確認後寫入表單（S22）。
// 檔案只在本機瀏覽器解析：不發網路請求、不寫任何儲存；解析後只保留帶入建議，原始檔內容不保留、不顯示。
// 已手動填過（非預設值）的欄位不覆蓋；寫入後觸發表單 change，由 ui.js 照常重算。
import { parseText } from './nhi_import.js';
import { buildProposals, planApply, planClear, planSwitch, switchText, FIELD_LABEL } from './nhi_import_rules.js';
import { readFields, displayValue } from './form_state.js';
import { setImported, importedMeds, medsBlock } from './nhi_meds_view.js';

const MAX_BYTES = 30 * 1024 * 1024;
const form = document.getElementById('f');
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// 表單預設值（HTML 初始狀態），格式同 readFields
function readDefaults() {
  const x = {};
  for (const e of form.elements) {
    if (!e.name) continue;
    if (e.type === 'checkbox') x[e.name] = e.defaultChecked;
    else if (e.type === 'radio') { if (e.defaultChecked) x[e.name] = e.value; }
    else if (e.options) { const o = [...e.options].find((op) => op.defaultSelected) || e.options[0]; x[e.name] = o && o.value !== '' ? o.value : null; }
    else x[e.name] = e.defaultValue === '' ? null : e.defaultValue;
  }
  return x;
}

function setField(field, value) {
  const els = [...form.querySelectorAll(`[name="${field}"]`)];
  let target = null;
  for (const e of els) {
    if (e.type === 'checkbox') { e.checked = value === true; target = e; }
    else if (e.type === 'radio') { e.checked = e.value === value; if (e.checked) target = e; }
    else { e.value = value === null || value === undefined ? '' : String(value); target = e; }
  }
  if (!target && els.length) target = els[0];
  if (target) target.dispatchEvent(new Event('change', { bubbles: true }));
}

function resetField(field) {
  const d = readDefaults()[field];
  const els = [...form.querySelectorAll(`[name="${field}"]`)];
  if (els.some((e) => e.type === 'radio') && d === undefined) {
    for (const e of els) e.checked = false;
    if (els[0]) els[0].dispatchEvent(new Event('change', { bubbles: true }));
  } else setField(field, d ?? (els[0]?.type === 'checkbox' ? false : null));
}

const display = (field, value) => displayValue(form, field, value);

// ── 版面：右上角按鈕＋上傳區 ──
const btn = el('button', 'nhi-toggle', '.json 上傳');
btn.type = 'button';
btn.setAttribute('aria-expanded', 'false');
btn.setAttribute('aria-controls', 'nhi-panel');
(document.querySelector('.site-header') || document.querySelector('main')).append(btn);

const panel = el('section', 'nhi-panel');
panel.id = 'nhi-panel';
panel.hidden = true;
panel.append(el('h2', '', '健保雲端資料 .json 帶入'));
panel.append(el('p', 'nhi-privacy', '檔案只在本機瀏覽器解析，不會上傳、不會儲存。請上傳 032 健保雲端書籤（nhi-harvest/3）擷取的 .json。'));
const drop = el('label', 'nhi-drop');
const input = el('input');
input.type = 'file';
input.accept = '.json,application/json';
drop.append(el('span', '', '拖放 .json 到此，或點此選擇檔案'), input);
const status = el('div', 'nhi-status');
status.setAttribute('aria-live', 'polite');
const preview = el('div', 'nhi-preview');
const actions = el('p', 'nhi-actions');
const applyBtn = el('button', 'btn primary', '帶入勾選項目');
applyBtn.type = 'button';
const clearBtn = el('button', 'btn', '清除帶入資料');
clearBtn.type = 'button';
actions.append(applyBtn, ' ', clearBtn);
panel.append(drop, status, preview, actions);
document.querySelector('main').insertBefore(panel, form);

btn.addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  btn.setAttribute('aria-expanded', String(!panel.hidden));
});

// ── 狀態：只保留帶入建議與已帶入欄位（不保留原始檔）──
let proposals = null; // { items, info, meds, recent, ldl, firstC10, ref, warnings }
let imported = {}; // field → 帶入值
let importedItems = {}; // field → 帶入的建議（含來源；S27 判讀所用資料）
let gen = 0; // 讀檔世代：換檔／清除／清空重評時遞增，進行中的舊讀檔完成後不得回寫

function syncButtons() {
  applyBtn.disabled = !proposals;
  clearBtn.disabled = !proposals && !Object.keys(imported).length && !importedMeds();
}

function renderPreview() {
  preview.replaceChildren();
  if (!proposals) return syncButtons();
  const plan = planApply(proposals.items, readFields(form), readDefaults());
  for (const w of proposals.warnings) preview.append(el('p', 'emph', w));
  preview.append(medsBlock(proposals.meds));
  if (!plan.length) preview.append(el('p', 'hint', '此檔沒有可帶入的欄位。'));
  const ul = el('ul', 'nhi-list');
  for (const it of plan) {
    const li = el('li', `nhi-item st-${it.status}`);
    const lab = el('label', 'nhi-head');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.dataset.field = it.field;
    cb.checked = it.status === 'apply';
    cb.disabled = it.status !== 'apply';
    lab.append(cb, ' ', el('b', '', FIELD_LABEL[it.field] || it.field), ' → ', el('span', 'nhi-val', display(it.field, it.value)), ' ');
    lab.append(el('span', it.kind === 'direct' ? 'tag-auto' : 'tag-pre', it.kind === 'direct' ? '直接' : '推算建議'));
    if (it.confidence === 'low') lab.append(' ', el('span', 'tag-gap', '低信心'));
    li.append(lab, el('span', 'cite', `來源：${it.source}`));
    if (it.note) li.append(el('span', 'cite', `註：${it.note}`));
    if (it.status === 'conflict') li.append(el('span', 'nhi-conflict', it.reason ? `${it.reason}，不帶入（如要改用請手動修改）。` : `目前已填「${display(it.field, it.current)}」，不覆蓋（如要改用請手動修改）。`));
    if (it.status === 'same') li.append(el('span', 'hint', '表單已是此值。'));
    ul.append(li);
  }
  preview.append(ul);
  if (proposals.info.length) {
    preview.append(el('p', 'nhi-sub', '參考（不帶入）'));
    const ui = el('ul', 'items');
    for (const x of proposals.info) ui.append(el('li', '', `${x.label}：${x.text}`));
    preview.append(ui);
  }
  preview.append(el('p', 'hint', '推算建議只是依健保雲端資料的規則推算，請逐項確認；資料窗有限（用藥約 6 個月、檢驗約 1 年），較早的病史看不到。statin 不耐受／禁忌症、抽菸、家族史等請手動填寫。'));
  syncButtons();
}

// S28 換檔提示：前一檔帶入值清除後，表單仍有非預設值 → 頁內提示＋「全部清空」（不用 alert／confirm）
const switchNote = el('div', 'nhi-switch');
switchNote.hidden = true;
const allBtn = el('button', 'btn', '全部清空');
allBtn.type = 'button';
const switchMsg = el('p', 'emph');
switchNote.append(switchMsg, allBtn);
panel.insertBefore(switchNote, preview);
const hideSwitchNote = () => { switchNote.hidden = true; };

// S29 解析失敗／過大：前一檔的預覽不再顯示、不可再帶入（避免誤當成新檔帶入）；表單與已帶入狀態不動
function dropPreview() {
  proposals = null;
  hideSwitchNote();
  renderPreview();
}

// 解析失敗、檔案過大、無檔 → 前一檔的表單值、帶入狀態、結果卡都不動（避免誤上傳非 032 檔就清空；S29 起失敗時清預覽）；
// 解析成功才換檔：還原前一檔帶入且未改過的欄位（S28，King 實測前一位病人資料殘留）→ 清前一檔用藥／判讀所用資料與結果卡 → 新檔預覽
async function take(file) {
  if (!file) return;
  const my = ++gen;
  status.replaceChildren();
  if (file.size > MAX_BYTES) { input.value = ''; status.append(el('p', 'emph', '檔案過大（上限 30 MB）；表單未變動，帶入預覽已清除。')); dropPreview(); return; }
  let r;
  try {
    r = parseText(await file.text());
  } catch {
    r = { ok: false, error: '無法讀取檔案。' };
  }
  if (my !== gen) return; // 讀檔期間已換檔／清除／清空重評 → 丟棄
  input.value = '';
  if (!r.ok) { status.append(el('p', 'emph', `${r.error}（表單未變動，帶入預覽已清除。）`)); dropPreview(); return; }
  const sw = planSwitch(imported, readFields(form), readDefaults());
  for (const f of sw.clear) resetField(f);
  imported = {};
  importedItems = {}; // 判讀所用資料只列目前這個檔帶入的欄位
  setImported(null); // 前一檔的用藥與判讀所用資料不再沿用到結果與病歷用摘要，按「帶入」才換成新檔
  const out = document.getElementById('result'); // 舊評估結果卡（含前一檔帶入用藥）清掉，直到重新評估
  out.replaceChildren();
  out.hidden = true;
  const note = switchText(sw);
  switchMsg.textContent = note || '';
  switchNote.hidden = !note;
  proposals = { ...buildProposals(r), warnings: r.warnings };
  status.append(el('p', '', `解析完成（擷取日 ${r.ref}；讀取 ${r.counts.rows} 列，重複 ${r.counts.dupRows} 列已略過）。${sw.clear.length ? `前一檔帶入的 ${sw.clear.length} 個欄位已清除。` : ''}勾選要帶入的項目後按「帶入勾選項目」。`));
  renderPreview();
}

// 「全部清空」＝清空重評（整份表單回到初始值），但保留剛解析的新檔預覽
allBtn.addEventListener('click', () => {
  const keep = proposals;
  document.getElementById('reset').click();
  proposals = keep;
  status.replaceChildren(el('p', '', '表單已全部清空；勾選要帶入的項目後按「帶入勾選項目」。'));
  renderPreview();
});

input.addEventListener('change', () => take(input.files && input.files[0]));
drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (ev) => {
  ev.preventDefault();
  drop.classList.remove('over');
  take(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]);
});

applyBtn.addEventListener('click', () => {
  if (!proposals) return;
  const plan = planApply(proposals.items, readFields(form), readDefaults());
  let n = 0;
  for (const cb of preview.querySelectorAll('input[type="checkbox"][data-field]:checked')) {
    const it = plan.find((x) => x.field === cb.dataset.field && x.status === 'apply');
    if (!it) continue;
    setField(it.field, it.value);
    imported[it.field] = it.value;
    importedItems[it.field] = it;
    n++;
  }
  // 評估結果與病歷用摘要顯示降脂用藥與判讀所用資料（S27）
  const { meds, recent, ldl, firstC10, ref } = proposals;
  setImported({ meds, recent, ldl, firstC10, ref, items: Object.values(importedItems) });
  status.replaceChildren(el('p', '', `已帶入 ${n} 項；推算建議請逐項確認後再按「評估」（結果會附降脂用藥與判讀所用資料）。`));
  renderPreview();
});

clearBtn.addEventListener('click', () => {
  const fields = planClear(imported, readFields(form));
  for (const f of fields) resetField(f);
  gen++;
  input.value = ''; // 讀檔中途清除：take() 被丟棄、不會清 input → 這裡清，才能立即再選同一檔
  imported = {};
  importedItems = {};
  proposals = null;
  setImported(null);
  hideSwitchNote();
  // 已顯示的評估結果含帶入的降脂用藥與舊欄位值 → 一併清掉，請重新評估
  const out = document.getElementById('result');
  const hadResult = !out.hidden;
  out.replaceChildren();
  out.hidden = true;
  status.replaceChildren(el('p', '', `已清除帶入資料（還原 ${fields.length} 個欄位；之後手動改過的欄位保留）${hadResult ? '；評估結果已一併清除，請重新按「評估」' : ''}。`));
  renderPreview();
});

// 「清空重評」：表單已整份回到初始值，這裡只丟掉帶入狀態
document.getElementById('reset').addEventListener('click', () => {
  gen++;
  input.value = '';
  imported = {};
  importedItems = {};
  proposals = null;
  setImported(null);
  hideSwitchNote();
  status.replaceChildren();
  renderPreview();
});

syncButtons();
