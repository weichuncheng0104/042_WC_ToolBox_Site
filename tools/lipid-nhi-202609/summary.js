// 病歷用純文字摘要：chartSummary(evaluate() 的結果) → 純文字，每行一項。
// 純函式：只讀引擎輸出的結構化結果，不抓 DOM、不含病人識別資料。台灣病歷慣例以英文縮寫為主。

const HEADER = '[NHI lipid criteria 2.6 (eff. 2026/09/01)]';

// 勾選條件 → 縮寫；子項只在主項勾選時列在括號內（與引擎判定一致）
const COND = {
  cad: 'CAD', pad: 'PAD', acs_history: 'ACS hx', revasc_pci_or_cabg: 'PCI/CABG', stroke_tia: 'ischemic stroke/TIA',
  pad_severe: 'PAD (revasc/ischemic sx/amputation)', imaging_stenosis_ge50: 'imaging stenosis ≥50%',
  dm: 'DM', ckd_predialysis: 'CKD (pre-dialysis)', dialysis: 'dialysis', htn: 'HTN', smoking: 'smoker',
  postmenopausal: 'postmenopausal', on_antihtn: 'on anti-HTN drug', on_dm_drug: 'on DM drug', on_tg_drug: 'on TG drug',
  t2_cvd: 'CVD (表二定義)', dx_primary_hc: 'primary hypercholesterolemia', dx_hofh: 'HoFH', dx_sitosterolemia: 'sitosterolemia',
  statin_intolerant: 'statin intolerance', statin_contraindicated: 'statin contraindication', statin_mono_ge3m: 'statin mono ≥3 mo',
  on_gemfibrozil: 'on gemfibrozil', acute_inpatient: 'acute inpatient', fh_features: 'FH features',
  hofh_genetic: 'HoFH genetic (FH score >8)', hofh_c1: 'xanthoma <10y', hofh_c2: 'untreated LDL-C >500 & treated >330',
  hofh_c3: 'parental hypercholesterolemia', hofh_c4: 'CHD <20y',
};
const SUBS = {
  cad: { mi_within_1y: 'MI within 1y', mi_count_ge2: 'MI ≥2', multivessel_cad: 'multivessel CAD', acs_with_dm: 'ACS + DM', pad_or_carotid: 'PAD/carotid stenosis' },
  pad: { pad_with_cad: 'CAD', pad_with_carotid: 'carotid stenosis' },
  stroke_tia: { athero_related: 'atherosclerotic dz' },
};
const BASIS = {
  'VH-1': 'ACS hx', 'VH-2': 'PCI/CABG', 'VH-3': 'stroke/TIA + atherosclerotic dz', 'VH-4': 'PAD (revasc/ischemic sx/amputation)',
  'VH-5': 'imaging stenosis ≥50%', 'HI-1': 'DM', 'HI-2': 'CKD (pre-dialysis)', 'HI-3': 'LDL-C ≥190', 'HI-4': 'CAC ≥400',
  'RF-1': 'HTN', 'RF-2': 'age (M≥45/F≥55)', 'RF-3': 'premature CHD FHx', 'RF-4': 'low HDL-C', 'RF-5': 'smoker', 'RF-6': 'MetS',
};
const TIER = { EX: 'Extreme risk (極高風險)', VH: 'Very high risk (非常高風險)', HI: 'High risk (高風險)', MOD: 'Moderate risk (中風險', LOW: 'Low risk (低風險', ZERO: '0 RF (0 項風險因子' };
const T2ROW = { 'T2-1': 'ACS hx or PCI/CABG (第1列)', 'T2-2': 'CVD or DM (第2列)', 'T2-3': '≥2 RFs (第3列)', 'T2-4': '1 RF (第4列)', 'T2-5': '0 RF (第5列)' };
const ST = { eligible: 'eligible', not_yet: 'not yet eligible', not_eligible: 'not eligible', undetermined: 'undetermined', conditional: 'conditional', forbidden: 'not allowed' };
const EVENT = { mi: 'MI', revasc: 'revascularization', stroke: 'atherosclerotic ischemic stroke' };

function ptLine(x) {
  const p = [];
  if (x.sex || x.age !== null) p.push(`${x.sex || '?'}/${x.age ?? '?'}y`);
  const v = (k, label) => { if (x[k] !== null) p.push(`${label} ${x[k]}`); };
  v('ldl', 'LDL-C'); if (x.ldl !== null) p[p.length - 1] += ' (baseline)';
  v('ldl_current', 'LDL-C'); if (x.ldl_current !== null) p[p.length - 1] += ' (current)';
  v('hdl', 'HDL-C'); v('tc', 'TC'); v('tg', 'TG');
  if (x.tc !== null && x.hdl !== null) p.push(`non-HDL-C ${x.tc - x.hdl}`);
  v('cac', 'CAC'); if (x.waist !== null) p.push(`waist ${x.waist} cm`);
  if (x.sbp !== null || x.dbp !== null) p.push(`BP ${x.sbp ?? '?'}/${x.dbp ?? '?'}`);
  v('fpg', 'FPG');
  return `Pt: ${p.length ? p.join('; ') : 'no data entered'}`;
}

function condLine(x) {
  const c = [];
  for (const [k, label] of Object.entries(COND)) {
    if (!x[k]) continue;
    const subs = SUBS[k] ? Object.entries(SUBS[k]).filter(([s]) => x[s]).map(([, t]) => t) : [];
    c.push(subs.length ? `${label} (${subs.join(', ')})` : label);
  }
  if (x.fam_male_onset_age !== null) c.push(`FHx CHD male relative ${x.fam_male_onset_age}y`);
  if (x.fam_female_onset_age !== null) c.push(`FHx CHD female relative ${x.fam_female_onset_age}y`);
  return `Risk factors/conditions: ${c.length ? c.join(', ') : 'none'}`;
}

function basisText(b) {
  if (b.ruleId === 'EX-1') return `CAD + ${SUBS.cad[b.sub]}`;
  if (b.ruleId === 'EX-2') return `PAD + ${SUBS.pad[b.sub]}`;
  return BASIS[b.ruleId];
}

function startLine(cond, e, lifestyleWord) {
  const head = `Start-of-treatment ${cond}`;
  if (e.status === 'need_ldl') return `${head}: baseline LDL-C needed`;
  if (e.status === 'undetermined') return `${head}: undetermined (${e.need})`;
  if (e.status === 'eligible') {
    return e.lifestyleFirst ? `${head}: met, but needs 3-6 mo ${lifestyleWord} before statin` : `${head}: met → statin reimbursable`;
  }
  const gap = e.gap !== null ? ` (gap ${e.gap} mg/dL)` : '';
  return `${head}: not met${gap} → not reimbursable${e.lifestyleFirst ? `; ${lifestyleWord} 3-6 mo first` : ''}`;
}

function currentText(t) {
  return t.ldl.met === null || t.ldl.met === undefined ? '' : `; current LDL-C ${t.ldl.current}: ${t.ldl.met ? 'at target' : 'not at target'}`;
}

function table1Lines(t) {
  if (t.tier.status !== 'ok') return ['Risk (表一): undetermined — needs sex/age', 'Start-of-treatment: undetermined'];
  const id = t.tier.id;
  const rfs = id === 'MOD' || id === 'LOW' || id === 'ZERO' ? `; ${t.rfCount} RF${t.rfCount === 1 ? '' : 's'})` : '';
  const basis = t.tier.basis.map(basisText).filter(Boolean);
  const L = [`Risk (表一): ${TIER[id]}${rfs} — basis: ${basis.length ? basis.join(', ') : 'none'}`];
  const note = t.notes.find((n) => n.ruleId === 'TIER-UNLISTED');
  if (note) L.push(`Note: ${note.unlisted.map((k) => COND[k]).join(', ')} checked but no listed extreme/very-high criteria → not counted in risk tier`);
  L.push(startLine(`LDL-C ≥${t.eligibility.start}`, t.eligibility, 'lifestyle modification'));
  const nh = t.targets.nonhdl.value === null ? 'non-HDL-C not specified' : `non-HDL-C <${t.targets.nonhdl.value} mg/dL`;
  L.push(`Target: LDL-C <${t.targets.ldl.value} mg/dL; ${nh}${currentText(t.targets)}`);
  return L;
}

function table2Lines(t) {
  if (t.row.id === null) return ['Risk (表二): undetermined — needs sex/age', 'Start-of-treatment (表二): undetermined'];
  const { ldl, tc } = t.targets;
  const cond = tc.value === null ? `LDL-C ≥${ldl.value}` : `TC ≥${tc.value} or LDL-C ≥${ldl.value}`;
  return [
    `Risk (表二): ${T2ROW[t.row.id]}; 表二 RFs ${t.rfCount}`,
    startLine(cond, t.eligibility, 'non-drug therapy'),
    `Target (表二): LDL-C <${ldl.value} mg/dL${tc.value === null ? '' : `; TC <${tc.value} mg/dL`}${currentText(t.targets)}`,
  ];
}

function txLine(x) {
  const p = [];
  if (x.statin_mono_weeks !== null) p.push(`statin mono ${x.statin_mono_weeks} wk`);
  if (x.high_or_max_statin_months !== null) p.push(`high-intensity/max statin ${x.high_or_max_statin_months} mo`);
  if (x.eze_add_on_months !== null) p.push(`+ ezetimibe ${x.eze_add_on_months} mo`);
  if (x.statin_eze_combo_months !== null) p.push(`statin + ezetimibe ${x.statin_eze_combo_months} mo`);
  if (EVENT[x.major_cv_event]) p.push(`${EVENT[x.major_cv_event]}${x.event_date ? ` on ${x.event_date}` : ''}`);
  // 路徑 II（statin 禁忌症／不耐受）此題停用、不列（S9；user 2026-10-30「是 照你建議」）
  const pathII = x.statin_intolerant || x.statin_contraindicated;
  if (EVENT[x.major_cv_event] && x.max_statin_within_1y === 'yes' && !pathII) p.push('max-tolerated statin started ≤1y after event');
  return p.length ? `Tx hx: ${p.join('; ')}` : null;
}

// ezetimibe 結論的簡短理由：取決定性的最後一項（略過 Q16 附註與 3 個月勾選提示）
const EZE_WHY = {
  'EZE-IND': 'needs dx: primary HC/HoFH/sitosterolemia',
  'EZE-TABLE': { not_eligible: 'start criteria not met', undetermined: 'start criteria undetermined' },
  'EZE-A': 'statin intolerance',
  'EZE-B': { eligible: 'statin mono ≥6-8 wk not at target', not_yet: 'needs statin mono ≥6-8 wk not at target', not_eligible: 'already at LDL-C target', undetermined: 'needs current LDL-C', conditional: 'listed product needs statin mono ≥3 mo' },
  'EZE-B-LIST': { eligible: 'listed product, statin mono ≥3 mo not at target', not_yet: 'listed product needs statin mono ≥3 mo', conditional: 'listed product needs statin mono ≥3 mo' },
};
function ezeLine(d) {
  const key = d.items.filter((i) => i.ruleId !== 'Q16' && i.ruleId !== 'MONO-3M-HINT').at(-1).ruleId;
  const w = EZE_WHY[key];
  const why = typeof w === 'string' ? w : w && w[d.status];
  return `Ezetimibe (2.6.2): ${ST[d.status]}${why ? ` (${why})` : ''}`;
}

export function chartSummary(r) {
  const x = r.input;
  const scope = x.table_choice === 'yes' ? ' 表二品項' : x.table_choice === 'unsure' ? ' 品項未確定，表一／表二並列' : '';
  const L = [`${HEADER}${scope}`, ptLine(x), condLine(x)];
  if (r.table1) L.push(...table1Lines(r.table1));
  if (r.table2) L.push(...table2Lines(r.table2));
  const tx = txLine(x);
  if (tx) L.push(tx);
  const drug = (id) => r.drugs.find((d) => d.id === id);
  if (x.statin_mono_weeks !== null || x.ldl_current !== null || x.statin_intolerant || x.dx_hofh || x.dx_sitosterolemia) L.push(ezeLine(drug('ezetimibe')));
  const evo = drug('evolocumab'), ali = drug('alirocumab');
  const pcsk9Input = EVENT[x.major_cv_event] || x.hofh_genetic || x.statin_eze_combo_months !== null || x.high_or_max_statin_months !== null || x.eze_add_on_months !== null;
  if (evo && pcsk9Input) {
    const pre = [evo, ali].some((d) => d.status === 'eligible') ? '; pre-approval required (附表二-D)' : '';
    // 區 8 未選事件：只註明未選，不寫「未發生事件」（S8 F1）
    const noEvt = EVENT[x.major_cv_event] ? '' : ' (MACE path: section 8 event type not selected)';
    L.push(`PCSK9 (2.6.4): evolocumab ${ST[evo.status]}; alirocumab ${ST[ali.status]}${pre}${noEvt}`);
  }
  return L.join('\n');
}
