// 健保雲端 .json 帶入規則（S22，純函式）：parseBundle() 結果 → 帶入建議（items）＋參考資訊（info）。
// kind：direct＝直接取值；infer＝推算建議（需醫師確認）。所有建議都要使用者勾選確認才寫入表單。
// 品項表別／清單歸屬一律查 DRUG_CODES（drug_lookup.js），本檔不寫死任何品項；statin 強度與「最大耐受」不推算。
import { lookupDrug, infoOf } from './drug_lookup.js';
import { ICD_GROUPS, ATC_GROUPS, LIPID_ATC, STATIN_ATC, REVASC_TEXT } from './nhi_import_map.js';

// 表單全部欄位，依表單順序（S32 手動輸入段也用這份，測試 M05 對帳 index.html）
export const FIELD_LABEL = {
  table_choice: '0 適用表',
  sex: '1 性別', age: '1 年齡', postmenopausal: '1 已停經', ldl: '1 起始判定用 LDL-C', ldl_current: '1 目前 LDL-C', hdl: '1 HDL-C', tc: '1 總膽固醇 TC', tc_start: '1 起始判定用 TC', tg: '1 空腹 TG',
  cad: '2 冠狀動脈疾病', mi_within_1y: '2 一年內曾經歷心肌梗塞', mi_count_ge2: '2 ≧兩次心肌梗塞病史', multivessel_cad: '2 多支冠狀動脈阻塞', acs_with_dm: '2 急性冠心症合併糖尿病', pad_or_carotid: '2 冠狀動脈疾病合併：周邊動脈疾病或頸動脈狹窄', pad: '2 周邊動脈疾病', pad_with_cad: '2 周邊動脈疾病合併冠狀動脈疾病', pad_with_carotid: '2 周邊動脈疾病合併頸動脈狹窄',
  acs_history: '3 急性冠心症病史', revasc_pci_or_cabg: '3 血管再通術（PCI／CABG）', stroke_tia: '3 缺血性中風／TIA', athero_related: '3 合併動脈硬化相關疾病或病史', pad_severe: '3 周邊動脈疾病：曾接受血管再通術、有肢體缺血相關症狀或截肢', imaging_stenosis_ge50: '3 影像確認 ≧50% 直徑狹窄',
  dm: '4 糖尿病', ckd_predialysis: '4 慢性腎臟病', dialysis: '4 已進入透析', cac: '4 冠狀動脈鈣化分數 CAC',
  htn: '5 高血壓', fam_male_onset_age: '5 早發性冠心病家族史：男性親屬發病年齡', fam_female_onset_age: '5 早發性冠心病家族史：女性親屬發病年齡', smoking: '5 抽菸', waist: '5 腰圍（cm）', sbp: '5 收縮壓', dbp: '5 舒張壓', on_antihtn: '5 使用高血壓藥物', fpg: '5 空腹血糖', on_dm_drug: '5 使用糖尿病藥物', on_tg_drug: '5 使用治療 TG 血脂藥物',
  t2_cvd: '6 符合表二心血管疾病定義',
  dx_primary_hc: '7 診斷：原發性高膽固醇血症', dx_hofh: '7 診斷：HoFH', dx_sitosterolemia: '7 診斷：同型接合子性麥脂醇血症', statin_intolerant: '7 statin 無法耐受', statin_contraindicated: '7 statin 禁忌症', statin_mono_weeks: '7 statin 單一治療已持續（週）', statin_mono_ge3m: '7 statin 單一治療已滿 3 個月',
  eze_listed: '7 ezetimibe 是否為 2.6.2 清單品項', cmb_listed: '7 複方是否為 2.6.3 清單品項', on_gemfibrozil: '7 正在使用 gemfibrozil', acute_inpatient: '7 急性住院中', fh_features: '7 嚴重高膽固醇血症／肌腱黃色瘤／早發心血管疾病／家族病史',
  major_cv_event: '8 重大心血管事件', max_statin_within_1y: '8 事件後一年內已開始最大耐受劑量 statin', event_date: '8 事件日期', high_or_max_statin_months: '8 高強度或最大耐受 statin 已持續（月）', eze_add_on_months: '8 合併 ezetimibe 已持續（月）', statin_eze_combo_months: '8 最高忍受劑量 statin＋ezetimibe 已持續（月）',
  hofh_genetic: '8 HoFH 基因檢測異常且 FH 評分 >8', hofh_gene_negative: '8 基因檢測未檢出同合子或多重基因異常', hofh_dx_confirmed: '8 已確診 HoFH', hofh_c1: '8 HoFH 徵狀：10 歲前黃色瘤', hofh_c2: '8 HoFH 徵狀：未治療 LDL-C>500 且治療後>330', hofh_c3: '8 HoFH 徵狀：父母高膽固醇血症', hofh_c4: '8 HoFH 徵狀：20 歲前冠心病',
};

const DAY = 86400000;
const toMs = (s) => Date.parse(`${s}T00:00:00Z`);
const addDays = (s, n) => new Date(toMs(s) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY);
const GAP_DAYS = 30; // 相鄰處方間隔 ≦30 天視為連續
const ACTIVE_DAYS = 90; // 處方涵蓋到擷取日前 90 天內 → 視為使用中
const MONTH_DAYS = 31; // 月數下限：以 31 天為 1 個月無條件捨去

const toIv = (intervals) => intervals.filter((x) => x.days > 0).map((x) => ({ s: x.start, e: addDays(x.start, x.days) })).sort((a, b) => toMs(a.s) - toMs(b.s));

// [from, to) 之間實際有處方涵蓋的天數（重疊只算一次；空窗不計）——下限只計有藥的天數
export function coveredDays(intervals, from, to) {
  let n = 0, upTo = toMs(from);
  for (const x of toIv(intervals)) {
    const s = Math.max(toMs(x.s), upTo), e = Math.min(toMs(x.e), toMs(to));
    if (e > s) { n += Math.round((e - s) / DAY); upTo = e; }
  }
  return n;
}

// 處方期間合併：intervals [{start, days}] → 最後一段（間隔 ≦30 天視為同一段）{start, end, days, current, windowStart}
// days＝該段內截至 min(end, ref) 實際有處方涵蓋的天數（空窗不計）
export function coverage(intervals, ref, firstDrugDate) {
  const iv = toIv(intervals);
  if (!iv.length) return null;
  let cur = { ...iv[0] };
  for (const x of iv.slice(1)) {
    if (toMs(x.s) <= toMs(addDays(cur.e, GAP_DAYS))) { if (toMs(x.e) > toMs(cur.e)) cur.e = x.e; } else cur = { ...x };
  }
  const end = toMs(cur.e) < toMs(ref) ? cur.e : ref;
  return { start: cur.s, end: cur.e, days: coveredDays(intervals, cur.s, end), current: toMs(cur.e) >= toMs(addDays(ref, -GAP_DAYS)), windowStart: cur.s === firstDrugDate };
}

const LAB = {
  ldl: { code: '09044C', label: 'LDL-C' }, hdl: { code: '09043C', label: 'HDL-C' }, tc: { code: '09001C', label: '總膽固醇' },
  tg: { code: '09004C', label: 'TG' }, fpg: { code: '09005C', label: '空腹血糖' }, egfr: { code: '09015C', label: 'eGFR', item: /gfr/i },
};
const unitOk = (key, u) => {
  const n = u.toLowerCase().replace(/\s+/g, '');
  if (key === 'egfr') return /min/.test(n) || ['', '-', '無', 'none', 'n'].includes(n);
  return ['', '-', 'mg/dl', 'mg'].includes(n);
};
const labRows = (p, key) => p.labs.filter((l) => l.code === LAB[key].code && (!LAB[key].item || LAB[key].item.test(l.item)));

// S31 可用值＝數值且單位相符，且該日沒有不同數值。有問題的紀錄：同日不同值（整日）、單位不符、非數字；空白、N/A 不算
const labValid = (key, l) => l.value !== null && unitOk(key, l.unit);
function conflictDates(p, key) {
  const seen = new Map();
  for (const l of labRows(p, key).filter((x) => labValid(key, x))) seen.set(l.date, (seen.get(l.date) || new Set()).add(l.value));
  return new Set([...seen].filter(([, v]) => v.size > 1).map(([d]) => d));
}
const usableRows = (p, key) => { const bad = conflictDates(p, key); return labRows(p, key).filter((l) => labValid(key, l) && !bad.has(l.date)); };
function problemsOf(p, key) {
  const bad = conflictDates(p, key);
  const rows = labRows(p, key);
  const out = [...bad].map((date) => ({ date, kind: 'conflict', raws: [...new Set(rows.filter((l) => l.date === date && labValid(key, l)).map((l) => l.raw))] }));
  for (const l of rows) {
    if (l.value === null && l.reason !== 'empty') out.push({ date: l.date, kind: 'nonnumeric', raws: [l.raw] });
    else if (l.value !== null && !unitOk(key, l.unit)) out.push({ date: l.date, kind: 'unit', raws: [`${l.raw} ${l.unit}`] });
  }
  return out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}
// 範圍內最近一筆可用值（往前回溯）。problems＝採用值當日及之後的問題（無可用值則範圍內全部）
function latest(p, key, { before, onOrAfter } = {}) {
  const inRange = (l) => (!before || l.date < before) && (!onOrAfter || l.date >= onOrAfter);
  const row = usableRows(p, key).filter(inRange).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const problems = problemsOf(p, key).filter((x) => inRange(x) && (!row || x.date >= row.date));
  return { row, problems };
}

const fmt = (n) => String(n);
const isStatin = (d) => d.atc.startsWith(STATIN_ATC) || (d.atc.startsWith('C10B') && /statin/i.test(d.ing));
const isEze = (d) => d.atc === 'C10AX09' || /ezetimibe/i.test(d.ing);
const isLipid = (d) => d.atc.startsWith(LIPID_ATC);
const active = (d, ref, days = ACTIVE_DAYS) => toMs(addDays(d.date, d.days)) >= toMs(addDays(ref, -days));
const matchIcd = (g, code) => g.prefixes.some((p) => code.startsWith(p)) && !(g.exclude || []).some((p) => code.startsWith(p));
const plainName = (s) => s.replace(/\s*[（(][^（）()]*[）)]\s*/g, ' ').replace(/\s+/g, ' ').trim() || s; // 簡潔來源：藥名／處置名去掉括號段（以空白取代、不黏字），避免括號疊括號
const dotIcd = (c) => (c.length > 3 ? `${c.slice(0, 3)}.${c.slice(3)}` : c); // 簡潔來源顯示用：I214 → I21.4
const hitOf = (code) => lookupDrug(code).filter((x) => x.code === code)[0];

// 降脂用藥（ATC C10）顯示用：清單屬性查 DRUG_CODES（同「藥品查詢」）
const LISTING_LABEL = { t2: '2.6.1 僅適用表二', eze3m: '2.6.2 ezetimibe 清單', cmb3m: '2.6.3 複方清單', none: '非清單品項' };
const listingOf = (hit) => {
  if (!hit) return { key: 'none', label: LISTING_LABEL.none };
  if (hit.category === 'ann1') return { key: 'ann1', label: `非清單品項（公告附件1，適用 ${hit.rule}）` };
  return { key: hit.category, label: LISTING_LABEL[hit.category] };
};
// 含量：只取商品名中的「數字＋mg／mcg／g」（複方 10/20 mg）；沒有就空白，不猜
const strengthOf = (name) => {
  const m = /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*)\s*(mg|mcg|µg|μg|g)(?![a-z])/i.exec(name);
  return m ? `${m[1].replace(/\s+/g, '')}${m[2].toLowerCase()}` : '';
};
const medOf = (d) => {
  const hit = hitOf(d.code);
  const name = d.name || (hit ? hit.name : '');
  return { date: d.date, code: d.code, atc: d.atc, ing: d.ing, name, strength: strengthOf(name), fre: d.fre || '', qty: d.qty || '', days: d.days, listing: listingOf(hit) };
};
// 同品項取一列：處方日較新者；同日取給藥天數最長
const better = (a, b) => (a.date !== b.date ? (a.date > b.date ? a : b) : (b.days > a.days ? b : a));

// 目前＝最近一次 C10 處方日所開立的各品項（同日全列）；先前＝資料窗內其他 C10 品項，每品項取最近一次處方（新→舊）
export function lipidMeds(p) {
  const rx = p.drugs.filter(isLipid);
  const lastDate = rx.reduce((m, d) => (!m || d.date > m ? d.date : m), null);
  const byCode = (rows) => {
    const m = new Map();
    for (const d of rows) m.set(d.code, m.has(d.code) ? better(m.get(d.code), d) : d);
    return [...m.values()];
  };
  const current = byCode(rx.filter((d) => d.date === lastDate)).map(medOf);
  const now = new Set(current.map((x) => x.code));
  const previous = byCode(rx.filter((d) => !now.has(d.code))).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).map(medOf);
  return { ref: p.ref, lastDate, current, previous };
}

// S27：擷取日前 180 天內（含第 180 天與擷取日當天；擷取日之後不算）有任何 C10 處方 → 有現有降脂用藥，分析區與摘要最上方加註此句
export const RECENT_LIPID_NOTE = '[六個月內有使用降血脂藥，以下取值僅供參考]';
const RECENT_DAYS = 180;
export function recentLipidRx(p) {
  const from = addDays(p.ref, -RECENT_DAYS);
  return p.drugs.some((d) => isLipid(d) && d.date >= from && d.date <= p.ref);
}

// S27：LDL-C 歷次附註（摘要與結果卡共用）
export const firstC10Text = (d, recent = false) => (d ? `資料內第一張降血脂藥處方 ${d}，基線取其前最近一筆${recent ? '；現用藥：起始判定取基線與 6 個月內最高之高值' : ''}` : '資料內無降血脂藥處方，基線取最近一筆');

// S30 現用藥起始判定值：擷取日前 180 天內（含邊界）最高可用值；同日不同值的日期不採用（S31）
function peak6m(p, key) {
  const from = addDays(p.ref, -RECENT_DAYS);
  const rows = usableRows(p, key).filter((l) => l.date >= from && l.date <= p.ref);
  if (!rows.length) return null;
  return rows.reduce((m, l) => (l.value > m.value || (l.value === m.value && l.date > m.date) ? l : m));
}

// 帶入狀態（單一出口）：proposals＝buildProposals() 結果、items＝實際帶入的建議
export const importedState = ({ meds, recent, ldl, firstC10, ref, labProblems }, items) => ({ meds, recent, ldl, firstC10, ref, labProblems, items });

// S31 問題列表（結果區與摘要最上方共用）：欄位、日期、原始值、改用的值、建議補的欄位
const FIX_FIELD = { ldl: '開始藥物治療前 LDL-C（基線）', ldl_current: '目前 LDL-C', hdl: 'HDL-C', tc: '總膽固醇 TC', tc_start: '起始判定用 TC', tg: '空腹 TG', fpg: '空腹血糖' };
const PROBLEM_WORD = { conflict: '同日不同值', unit: '單位不符', nonnumeric: '非數字' };
const usedWord = (e, blank) => (!e.used ? '無可用值' : blank ? `欄位空白，未採用 ${e.used.date} 的 ${e.used.text}` : `改用 ${e.used.date} 的 ${e.used.text}`);
const problemText = (e, blank = false) => `${e.problems.map((x) => `${x.date} ${x.raws.join('、')}（${PROBLEM_WORD[x.kind]}）`).join('；')} → ${usedWord(e, blank)}；建議核對或手填「${FIX_FIELD[e.field]}」`;
// 手填值與採用值不同 → 該欄的問題移除；清空不算手填（user 2026-11-04）
export function openProblems(data, current) {
  return (data.labProblems || []).filter((e) => {
    const cur = nv(current[e.field]);
    return cur === '' || (!!e.used && Number(cur) === Number(e.used.value));
  }).map((e) => `${FIX_FIELD[e.field]}：${problemText(e, nv(current[e.field]) === '')}`);
}

// S30 評估時的現用藥脈絡：data＝帶入狀態、current＝表單值。無帶入 → {}（手動流程不變）。
// 目前值仍等於帶入值 → 帶入來源；改過，或現用藥而未帶入、手填 → manual
export function importContext(data, current) {
  if (!data) return {};
  const ctx = { on_lipid_rx: !!data.recent };
  for (const f of ['ldl', 'tc_start']) {
    const it = data.items.find((x) => x.field === f);
    const cur = nv(current[f]);
    const manual = it ? !!it.basis && cur !== nv(it.value) : !!data.recent && cur !== '';
    ctx[`${f}_basis`] = manual ? 'manual' : (it && it.basis) || null;
    ctx[`${f}_date`] = !manual && it && it.basis ? it.date : null;
  }
  return ctx;
}

// S27：資料窗內全部 LDL-C（依日期舊→新；同日同值只列一次；非數字或單位不符 → value null；不等號保留寫法）
function ldlHistory(p) {
  const seen = new Set();
  return labRows(p, 'ldl')
    .map((l) => { const value = typeof l.value === 'number' && unitOk('ldl', l.unit) ? l.value : null; return { date: l.date, value, ...(value !== null && l.qual ? { qual: l.qual } : {}) }; })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .filter((x) => { const k = `${x.date}|${x.qual || ''}${x.value}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// S27 判讀所用資料：data＝帶入時保存的 { meds, recent, ldl, firstC10, ref, items（已帶入的建議） }；current＝評估時的表單值；
// show(field, value)＝顯示文字；changed＝表單上目前生效且非預設值的欄位（changedFields()）。
// used＝目前值仍等於帶入值 → 值＋簡潔來源 brief（S28：`項目 (日期)`；標籤去表單區號）。
// manual（S32）＝其餘手動輸入，依表單順序：帶入後改過或清空者註明；未帶入者列目前值
export function importBasis(data, current, show, changed = []) {
  const label = (f) => (FIELD_LABEL[f] || f).replace(/^\d+ /, '');
  const byField = new Map(data.items.map((it) => [it.field, it]));
  const isEdited = (it) => nv(current[it.field]) !== nv(it.value);
  const used = data.items.filter((it) => !isEdited(it)).map((it) => ({ field: it.field, label: label(it.field), text: show(it.field, it.value), source: it.brief }));
  const typed = new Set([...data.items.filter(isEdited).map((it) => it.field), ...changed.filter((f) => !byField.has(f))]);
  const manual = Object.keys(FIELD_LABEL).filter((f) => typed.has(f)).map((f) => {
    const edited = byField.has(f);
    const text = edited && nv(current[f]) === '' ? '帶入後清空' : `${show(f, current[f])}${edited ? '（帶入後修改）' : ''}`;
    return { field: f, label: label(f), text };
  });
  return { recent: data.recent, meds: data.meds, used, manual, ldl: data.ldl, firstC10: data.firstC10, ref: data.ref, problems: openProblems(data, current) };
}

// S28 簡潔格式（摘要與結果卡共用）：`項目：值 — 來源 (日期)`；S32 手動輸入 `項目：值`
export const basisLine = (u) => `${u.label}：${u.text} — ${u.source}`;
export const manualLine = (u) => `${u.label}：${u.text}`;
export const ldlLine = (ldl) => (ldl.length ? ldl.map((x) => `${x.qual || ''}${x.value ?? '無法判讀'} (${x.date})`).join('、') : '資料窗內無');

export function buildProposals(p) {
  const items = [];
  const info = [];
  const add = (field, value, kind, source, extra = {}) => items.push({ field, value, kind, source, ...extra });

  // ── 性別、年齡（page_text 身分列；原文不保留）──
  if (p.sex) add('sex', p.sex, 'direct', '病人身分列', { brief: '身分列' });
  if (p.age !== null && p.age !== undefined) add('age', fmt(p.age), 'infer', `生日與擷取日 ${p.ref} 計算`, { brief: `生日／擷取日 (${p.ref})` });

  // ── 檢驗 ──
  const lipidRx = p.drugs.filter(isLipid);
  const firstDrug = p.drugs.reduce((m, d) => (!m || d.date < m ? d.date : m), null);
  const firstC10 = lipidRx.reduce((m, d) => (!m || d.date < m ? d.date : m), null);
  const labProblems = []; // S31 問題列表的來源
  const rawOf = (row) => (row.qual ? `${row.raw} ` : '');
  const flag = (field, key, problems, row) => {
    if (!problems.length) return;
    const e = { field, problems, used: row ? { date: row.date, text: row.raw, value: fmt(row.value) } : null };
    labProblems.push(e);
    info.push({ label: LAB[key].label, text: problemText(e) });
  };
  const labProp = (field, key, r, kind, extraNote) => {
    flag(field, key, r.problems, r.row);
    if (!r.row) return;
    const notes = [extraNote, r.problems.length ? `較新的 ${r.problems.length} 項紀錄有問題（同日不同值、單位不符或非數字）而略過` : '', r.row.qual ? `原始值 ${r.row.raw}，去掉不等號取值` : ''].filter(Boolean);
    add(field, fmt(r.row.value), kind, `檢驗日 ${r.row.date}（${r.row.item || LAB[key].code}）`, { brief: `${plainName(r.row.item || LAB[key].label)} ${rawOf(r.row)}(${r.row.date})`, ...(notes.length ? { note: notes.join('；') } : {}) });
  };
  // S30 現用藥（180 天內有 C10）：起始判定值＝max(治療前基線, 6 個月內最高)；同值取基線；有問題的紀錄不採用（S31）
  const startProp = (field, key) => {
    const usesBase = firstDrug && firstDrug < firstC10;
    const base = usesBase ? latest(p, key, { before: firstC10 }) : { problems: [] };
    const pk = peak6m(p, key);
    const from = addDays(p.ref, -RECENT_DAYS);
    const inWindow = problemsOf(p, key).filter((x) => x.date >= from && x.date <= p.ref);
    const problems = [...base.problems, ...inWindow.filter((x) => !base.problems.some((y) => y.date === x.date && y.kind === x.kind))];
    const usePre = !!base.row && (!pk || base.row.value >= pk.value);
    const r = usePre ? base.row : pk;
    flag(field, key, problems, r);
    if (!r) return;
    const tag = usePre ? 'pre-treatment' : '6-mo peak';
    add(field, fmt(r.value), 'infer', `檢驗日 ${r.date}（${r.item || LAB[key].code}）`, { brief: `${plainName(r.item || LAB[key].label)} ${rawOf(r)}${tag} (${r.date})`, basis: usePre ? 'pre' : 'peak', date: r.date,
      note: [usePre ? `現用藥：治療前基線（第一張降血脂藥處方 ${firstC10} 前最近一筆）不低於 6 個月內最高值；若更早已用藥則非真正基線`
        : r.date < firstC10 ? `現用藥：6 個月內最高值（此值在資料內第一張降血脂藥處方 ${firstC10} 之前；工具推算，非條文用語）` : '現用藥：6 個月內最高值（用藥中數值，工具推算，非條文用語）', r.qual ? `原始值 ${r.raw}，去掉不等號取值` : ''].filter(Boolean).join('；') });
  };
  const recent = recentLipidRx(p);
  if (!firstC10) {
    labProp('ldl', 'ldl', latest(p, 'ldl'), 'infer', '資料內無降血脂藥處方：最近 LDL-C 可能即治療前基線，請確認');
  } else {
    if (recent) { startProp('ldl', 'ldl'); startProp('tc_start', 'tc'); }
    else if (firstDrug && firstDrug < firstC10) labProp('ldl', 'ldl', latest(p, 'ldl', { before: firstC10 }), 'infer', `資料內第一張降血脂藥處方（${firstC10}）前最近一筆；若更早已用藥則非真正基線`);
    labProp('ldl_current', 'ldl', latest(p, 'ldl', { onOrAfter: firstC10 }), 'direct');
  }
  labProp('hdl', 'hdl', latest(p, 'hdl'), 'direct');
  labProp('tc', 'tc', latest(p, 'tc'), 'direct');
  labProp('tg', 'tg', latest(p, 'tg'), 'direct', '資料未註明是否空腹');
  labProp('fpg', 'fpg', latest(p, 'fpg'), 'infer', '資料未註明是否空腹');
  const eg = latest(p, 'egfr');
  const egConflict = eg.problems.find((x) => x.kind === 'conflict');
  if (eg.row && !egConflict) info.push({ label: 'eGFR', text: `最近一筆 ${eg.row.raw}（${eg.row.date}）；只供 CKD 判讀參考，不直接帶入。` });
  else if (egConflict) info.push({ label: 'eGFR', text: `最近一次檢驗日 ${egConflict.date} 同日有多個不同數值（可能為不同公式）；只供 CKD 判讀參考，不直接帶入。` });

  // ── 適用表：一律不帶入（S26 user 裁定：表一、表二條件與符合情形都要呈現，供記錄與未來選藥）──
  info.push({ label: FIELD_LABEL.table_choice, text: `適用表不帶入，維持目前選擇（預設「不確定」：表一、表二並列）${lipidRx.length ? '；目前降脂用藥的清單屬性見上方降脂用藥表' : ''}。` });

  // ── 用藥：目前降脂藥（最近一次降脂藥處方日）→ 清單品項（2.6.2／2.6.3）──
  if (lipidRx.length) {
    const lastDate = lipidRx.reduce((m, d) => (d.date > m ? d.date : m), '');
    const current = lipidRx.filter((d) => d.date === lastDate);
    const votes = new Map(); // field → Map(value → [品名])
    for (const d of current) {
      const hit = hitOf(d.code);
      let fv = null;
      if (hit) { const i = infoOf(hit); fv = [i.field, i.value, `${hit.name}（${d.code}）：${i.label}`]; }
      else if (d.atc.startsWith('C10AX09')) fv = ['eze_listed', 'no', `${d.name || d.code}（${d.code}）不在 2.6.2 清單：一般品項`];
      else if (d.atc.startsWith('C10B') && isEze(d)) fv = ['cmb_listed', 'no', `${d.name || d.code}（${d.code}）不在 2.6.3 清單：一般品項`];
      if (!fv || fv[0] === 'table_choice') continue;
      const m = votes.get(fv[0]) || new Map();
      m.set(fv[1], [...(m.get(fv[1]) || []), { why: fv[2], brief: `${plainName(d.name || (hit ? hit.name : d.code))} ${d.atc}` }]);
      votes.set(fv[0], m);
    }
    for (const [field, m] of votes) {
      if (m.size > 1) { info.push({ label: FIELD_LABEL[field], text: `最近一次降血脂藥處方（${lastDate}）含多個品項、結果不一致，未帶入。` }); continue; }
      const [[value, rows]] = [...m];
      add(field, value, 'infer', `處方日 ${lastDate}：${rows.map((x) => x.why).join('；')}`, { brief: `${rows.map((x) => x.brief).join('、')} (${lastDate})`, note: '只依目前用藥判斷；擬改用的品項請另查' });
    }

    // statin 單一治療期間／合併 ezetimibe 期間（下限）
    const ezeCov = coverage(lipidRx.filter(isEze).map((d) => ({ start: d.date, days: d.days })), p.ref, firstDrug);
    // 目前含 ezetimibe：最近處方日含 ezetimibe，或 ezetimibe 處方仍在涵蓋中（statin 與 ezetimibe 可能不同日開立）
    const regimenEze = current.some(isEze) || !!(ezeCov && ezeCov.current);
    if (!regimenEze && current.some(isStatin)) {
      const stIv = lipidRx.filter((d) => isStatin(d) && !isEze(d)).map((d) => ({ start: d.date, days: d.days }));
      const st = coverage(stIv, p.ref, firstDrug);
      if (st && st.current) {
        let start = st.start;
        if (ezeCov && ezeCov.end > start) start = ezeCov.end; // 之前用過 ezetimibe → 單一治療自停用後起算
        const days = coveredDays(stIv, start, toMs(st.end) < toMs(p.ref) ? st.end : p.ref);
        const note = `下限：只計處方日＋給藥日數實際涵蓋的天數（空窗不計；間隔 ≦${GAP_DAYS} 天視為同一段），自 ${start} 起${st.windowStart && start === st.start ? '（已是資料窗起點，實際可能更長）' : ''}`;
        const brief = `statin (${start}–${st.end})`;
        if (days >= 7) add('statin_mono_weeks', fmt(Math.floor(days / 7)), 'infer', `statin 處方 ${start}～${st.end}`, { brief, note });
        if (Math.floor(days / MONTH_DAYS) >= 3) add('statin_mono_ge3m', true, 'infer', `statin 處方 ${start}～${st.end}`, { brief, note });
      }
    }
    if (regimenEze && ezeCov && ezeCov.current) {
      add('eze_add_on_months', fmt(Math.floor(ezeCov.days / MONTH_DAYS)), 'infer', `含 ezetimibe 處方 ${ezeCov.start}～${ezeCov.end}`,
        { brief: `ezetimibe (${ezeCov.start}–${ezeCov.end})`, note: `下限：以 ${MONTH_DAYS} 天為 1 個月無條件捨去${ezeCov.windowStart ? '；已是資料窗起點，實際可能更長' : ''}；是否接在高強度／最大耐受 statin 之後請醫師確認` });
    }
    const st = current.filter(isStatin);
    if (st.length) info.push({ label: 'statin 強度／最大耐受', text: `目前 statin：${st.map((d) => d.name || d.code).join('、')}。強度與是否為最大耐受劑量不自動推算（第 8 區月數請自行填寫；可對照強度參考表）。` });
  }

  // ATC：使用中（處方涵蓋擷取日前 activeDays 天內；預設 90）
  for (const g of ATC_GROUPS) {
    const hits = p.drugs.filter((d) => g.prefixes.some((x) => d.atc.startsWith(x)) && active(d, p.ref, g.activeDays));
    if (hits.length) {
      const last = hits.reduce((m, d) => (d.date > m.date ? d : m));
      add(g.field, true, 'infer', `處方日 ${last.date}：${last.name || last.code}（${last.atc}）`, { brief: `${plainName(last.name || last.code)} ${last.atc} (${last.date})`, note: g.reason });
    }
  }

  // ── 診斷（ICD-10）──
  const dxOf = (id) => {
    const g = ICD_GROUPS.find((x) => x.id === id);
    return p.dx.filter((d) => matchIcd(g, d.code)).sort((a, b) => (a.date < b.date ? 1 : -1));
  };
  const dxSource = (rows) => {
    const by = new Map();
    for (const r of rows) if (!by.has(r.code)) by.set(r.code, r);
    return [...by.values()].slice(0, 3).map((r) => `${r.code}（${r.source} ${r.date}）`).join('、') + (by.size > 3 ? ` 等 ${by.size} 碼` : '');
  };
  const dxBrief = (rows) => {
    const by = new Map();
    for (const r of rows) if (!by.has(r.code)) by.set(r.code, r);
    return `ICD ${[...by.values()].slice(0, 3).map((r) => `${dotIcd(r.code)} (${r.date})`).join('、')}${by.size > 3 ? ` 等 ${by.size} 碼` : ''}`;
  };
  const reason = (id) => ICD_GROUPS.find((x) => x.id === id).reason;
  const dxAdd = (field, id) => {
    const rows = dxOf(id);
    if (rows.length) add(field, true, 'infer', `ICD ${dxSource(rows)}`, { brief: dxBrief(rows), note: reason(id) });
    return rows;
  };
  const cad = dxAdd('cad', 'cad');
  const acs = dxAdd('acs_history', 'acs');
  const mi = dxOf('mi');
  if (mi.length && cad.length) {
    const recent = mi.filter((d) => d.date >= addDays(p.ref, -365));
    if (recent.length) add('mi_within_1y', true, 'infer', `ICD ${dxSource(recent)}`, { brief: dxBrief(recent), note: `擷取日 ${p.ref} 前一年內有心肌梗塞碼（I21／I22 於發病後 4 週內編碼，碼的日期可能晚於發病日最多約 4 週，近一年邊界請核對）；${reason('mi')}` });
  }
  // decisions S8 F1：區 2／3 項目不自動帶入區 8 重大心血管事件（PCSK9 範圍較窄），只提醒
  if (mi.length) info.push({ label: '8 重大心血管事件', text: `有心肌梗塞碼 ${dxSource(mi)}；PCSK9 的重大心血管事件請於第 8 區自行選擇（不自動帶入）。` });
  dxAdd('stroke_tia', 'stroke_tia');
  const pad = dxAdd('pad', 'pad');
  // 區 3 周邊動脈疾病：I70.21–I70.26 碼本身即肢體缺血症狀 → 優先；否則四肢繞道移植血管碼 → 曾接受四肢繞道手術（低信心）
  const padIsch = dxOf('pad_ischemia');
  const padGraft = dxOf('pad_graft');
  if (padIsch.length) add('pad_severe', true, 'infer', `ICD ${dxSource(padIsch)}`, { brief: dxBrief(padIsch), note: reason('pad_ischemia') });
  else if (padGraft.length) add('pad_severe', true, 'infer', `ICD ${dxSource(padGraft)}`, { brief: dxBrief(padGraft), confidence: 'low', note: reason('pad_graft') });
  const dm = dxAdd('dm', 'dm');
  dxAdd('htn', 'htn');
  dxAdd('dx_primary_hc', 'primary_hc');
  if (cad.length && acs.length && dm.length) add('acs_with_dm', true, 'infer', '同時有急性冠心症碼與糖尿病碼', { brief: 'ACS＋DM', note: '由上兩項推得' });
  if (cad.length && pad.length) {
    add('pad_or_carotid', true, 'infer', '同時有冠狀動脈疾病碼與周邊動脈疾病碼', { brief: 'CAD＋PAD', note: '由上兩項推得' });
    add('pad_with_cad', true, 'infer', '同時有周邊動脈疾病碼與冠狀動脈疾病碼', { brief: 'CAD＋PAD', note: '由上兩項推得' });
  }
  const dialysis = dxAdd('dialysis', 'dialysis');

  // CKD：ICD N18（非 N18.6）或 eGFR<60 兩次相隔 ≧90 天且其間皆 <60；已透析不建議（Q17）
  if (dialysis.length) {
    if (dxOf('ckd').length || labRows(p, 'egfr').length) info.push({ label: FIELD_LABEL.ckd_predialysis, text: '有透析相關碼：CKD 高風險條件限進入透析治療前（Q17），未建議。' });
  } else {
    const eg = labRows(p, 'egfr').filter((l) => l.value !== null && unitOk('egfr', l.unit)).sort((a, b) => (a.date < b.date ? -1 : 1));
    let pair = null;
    for (let i = 0; i < eg.length && !pair; i++) {
      if (eg[i].value >= 60) continue;
      for (let j = eg.length - 1; j > i; j--) {
        if (eg[j].value < 60 && diffDays(eg[i].date, eg[j].date) >= 90 && eg.slice(i, j + 1).every((x) => x.value < 60)) { pair = [eg[i], eg[j]]; break; }
      }
    }
    const ckdDx = dxOf('ckd');
    if (pair) add('ckd_predialysis', true, 'infer', `eGFR ${pair[0].value}（${pair[0].date}）→ ${pair[1].value}（${pair[1].date}），其間皆 <60`, { brief: `eGFR <60 (${pair[0].date}–${pair[1].date})`, note: '條文：eGFR<60 至少持續 3 個月（F p.39 三(二)）' });
    else if (ckdDx.length) add('ckd_predialysis', true, 'infer', `ICD ${dxSource(ckdDx)}`, { brief: dxBrief(ckdDx), note: reason('ckd') });
  }

  // 再通術：ICD 狀態碼；或特材／處置名稱關鍵字（低信心）
  const rv = dxOf('revasc');
  if (rv.length) add('revasc_pci_or_cabg', true, 'infer', `ICD ${dxSource(rv)}`, { brief: dxBrief(rv), note: reason('revasc') });
  else {
    const hit = p.procs.find((x) => (x.kind === 'material' ? REVASC_TEXT.material.every((re) => re.test(x.name)) : REVASC_TEXT.procedure.test(x.name)));
    if (hit) add('revasc_pci_or_cabg', true, 'infer', `${hit.kind === 'material' ? '特材' : '處置'} ${hit.date}：${hit.name}`, { brief: `${hit.kind === 'material' ? '特材' : '處置'} ${plainName(hit.name)} (${hit.date})`, confidence: 'low', note: '名稱關鍵字比對（低信心），請確認' });
  }
  return { items, info, meds: lipidMeds(p), recent, ldl: ldlHistory(p), firstC10, ref: p.ref, labProblems };
}

// 帶入前比對表單：未填（等於預設）→ apply；與擬帶入值相同 → same；已手動填其他值 → conflict（不覆蓋）
const nv = (v) => (v === undefined || v === null || v === false ? '' : String(v));
// 連動清除：帶入後表單會自動清掉的其他欄位（form_state.js syncMeno：男性 → 取消「已停經」）
const CLEARS = [{ field: 'sex', value: 'M', clears: 'postmenopausal', label: '已停經' }];
export function planApply(items, current, defaults) {
  return items.map((it) => {
    const cur = nv(current[it.field]);
    if (cur === nv(it.value)) return { ...it, status: 'same' };
    if (cur !== nv(defaults[it.field])) return { ...it, status: 'conflict', current: current[it.field] };
    const lk = CLEARS.find((c) => c.field === it.field && c.value === it.value && nv(current[c.clears]) !== nv(defaults[c.clears]));
    if (lk) return { ...it, status: 'conflict', current: current[it.field], reason: `帶入會清除已勾選的「${lk.label}」` };
    return { ...it, status: 'apply' };
  });
}

// 清除帶入資料：只還原「目前值仍等於帶入值」的欄位
export function planClear(imported, current) {
  return Object.keys(imported).filter((f) => nv(current[f]) === nv(imported[f]));
}

// S28 換檔（King 實測：前一位病人帶入值殘留）：新檔解析成功後，先還原前一檔帶入且仍等於帶入值的欄位（同 planClear）；
// manual＝還原後仍非預設值的欄位（手動填寫或帶入後改過）→ 上傳區提示 SWITCH_NOTE
export const SWITCH_NOTE = '已清除前一檔帶入的資料；表單仍有手動填寫的欄位，請確認是否屬於本病人。';
// 提示文字：無手動欄位 → null（不提示）；沒清任何欄位（首次上傳、前一檔未帶入）→ 不說「已清除」
export const switchText = (sw) => (!sw.manual.length ? null : sw.clear.length ? SWITCH_NOTE : '表單已有手動填寫的欄位，請確認是否屬於本病人。');
export function planSwitch(imported, current, defaults) {
  const clear = planClear(imported, current);
  const after = { ...current };
  for (const f of clear) after[f] = defaults[f];
  const manual = [...new Set([...Object.keys(after), ...Object.keys(defaults)])].filter((f) => nv(after[f]) !== nv(defaults[f]));
  return { clear, manual };
}
