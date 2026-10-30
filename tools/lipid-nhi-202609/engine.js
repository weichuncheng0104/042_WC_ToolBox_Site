// 健保降血脂藥物評估引擎（lipid-nhi-202609）
// 純函式：evaluate(病人條件物件) → 結果物件。無 DOM、無副作用、無外部請求。
// 只實作 spec/lipid-nhi-202609/rules.md；每個輸出項目帶規則 ID（ruleId）與出處（cite）。
// 出處代號：F＝完整給付規定1151022.pdf（115/10/22 版）頁碼。

export const META = {
  toolId: 'lipid-nhi-202609',
  regulation: '全民健康保險藥品給付規定 2.6 降血脂藥物（2.6.1–2.6.4）＋附表二-D',
  effective: '115/9/1 生效',
  snapshot: '依 115/10/22 版完整給付規定',
};

// ── 暫定裁定（provisional）：user 上線前一次確認；改判只改這裡（見 spec/lipid-nhi-202609/decisions.md）──
export const DECISIONS = {
  Q1_t2PostmenopauseCounts: true, // 表二 RF2 計入「停經者」；表一 RF-2 不計（表一無此字）
  Q3_unsureShowsBoth: true, // 品項「不確定」→ 表一、表二並列
  Q4Q18_unlistedAsUnchecked: true, // 勾 CAD／PAD／中風但 EX、VH 皆不成立 → 視同未勾，照常往下判，只附註
  Q6_zeroFollowsModLow: true, // 0 項列的處方規定／評估建議比照中、低風險
  Q7_hdlDoubleCount: true, // HDL-C 偏低同時算 RF-4 與代謝症候群一項
  Q8_bpEitherSbpOrDbp: true, // 代謝症候群血壓：SBP≧130 或 DBP≧85
  Q11_minMonoWeeks: 6, // 2.6.2／2.6.3「6-8週」以 6 週為下限
  Q12_requireTableEligibility: true, // ezetimibe／複方仍須先符合表一（或表二）起始條件
  Q14_statinStartWithin1y: true, // PCSK9 首次申請「一年內」＝事件後一年內開始最大耐受 statin（附表二-D 3.1），不以申請日距事件判定
  Q15_tgCvdUsesTable2Def: true, // 降 TG 表「心血管疾病」採表二定義
  Q16_ezeByArticle262: true, // ezetimibe 給付依 2.6.2（表一「或合併 ezetimibe」只並列顯示）
  Q17_dialysisExcludesCkd: true, // 透析病人 HI-2 不成立
  Q19_famHxInclusive: true, // 家族史 男≦55、女≦65 含邊界
  Q20_pcsk9PathIINoStatin: true, // PCSK9 路徑 II（statin 禁忌／不耐受）不要求正在使用 statin
  D1_pcsk9: true, // PCSK9 依 2.6.4 判定
  D2_table2: true, // 表二納入
  D5_tgTable: true, // 降 TG 表納入
};

// ── 表一（F p.37）──
const T1 = {
  EX: { label: '極高風險', start: 55, ldlT: 55, nonhdlT: 85, row: '極高列' },
  VH: { label: '非常高風險', start: 70, ldlT: 70, nonhdlT: 100, row: '非常高列' },
  HI: { label: '高風險', start: 100, ldlT: 100, nonhdlT: 130, row: '高列' },
  MOD: { label: '中風險', start: 115, ldlT: 115, nonhdlT: 145, row: '中列' },
  LOW: { label: '低風險', start: 130, ldlT: 130, nonhdlT: 160, row: '低列' },
  ZERO: { label: '0 項心血管風險因子', start: 160, ldlT: 160, nonhdlT: null, row: '0項列' },
};
// UI 問項區（由高到低）；較高層成立時，其下各區標「已由較高層級判定」
const SECTIONS = ['EX', 'VH', 'HI', 'RF'];
const SECTION_OF = { EX: 'EX', VH: 'VH', HI: 'HI', MOD: 'RF', LOW: 'RF', ZERO: 'RF' };

const item = (ruleId, text, cite, extra = {}) => ({ ruleId, text, cite, ...extra });
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function normalize(raw) {
  const x = { ...raw };
  for (const k of ['age', 'ldl', 'ldl_current', 'hdl', 'tc', 'tg', 'cac', 'waist', 'sbp', 'dbp', 'fpg',
    'fam_male_onset_age', 'fam_female_onset_age', 'statin_mono_weeks',
    'high_or_max_statin_months', 'eze_add_on_months', 'statin_eze_combo_months']) x[k] = num(raw[k]);
  x.sex = raw.sex === 'M' || raw.sex === 'F' ? raw.sex : null;
  // 停經僅女性適用（S11）：男性一律視為未停經
  if (x.sex === 'M') x.postmenopausal = false;
  // 事件日期只供病歷摘要，不參與判定（Q14）
  x.event_date = typeof raw.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.event_date) ? raw.event_date : null;
  delete x.months_since_event;
  // Q14 三態：'yes'／'no'／null（未填 → 無法判定，不當成「否」）
  // HoFH 臨床路徑兩前提（F p.42 2.(1)II）同為三態（S9）
  const tri = (v) => (v === true || v === 'yes' ? 'yes' : v === false || v === 'no' ? 'no' : null);
  for (const k of ['max_statin_within_1y', 'hofh_gene_negative', 'hofh_dx_confirmed']) x[k] = tri(raw[k]);
  x.table_choice = ['no', 'yes', 'unsure'].includes(raw.table_choice) ? raw.table_choice : 'no';
  x.eze_listed = ['no', 'yes', 'unsure'].includes(raw.eze_listed) ? raw.eze_listed : 'no';
  x.cmb_listed = ['no', 'yes', 'unsure'].includes(raw.cmb_listed) ? raw.cmb_listed : 'no';
  return x;
}

// ── 共用：HDL-C 偏低（RF-4／MS-5，F p.39）；回傳 true／false／null（無法判定）──
function hdlLow(x) {
  if (x.hdl === null) return false; // 未填 HDL-C：不計（golden 共通預設）
  if (x.sex === null) return null;
  return x.sex === 'M' ? x.hdl < 40 : x.hdl < 50;
}

function famHx(x) {
  const le = (a, b) => (DECISIONS.Q19_famHxInclusive ? a <= b : a < b);
  return (x.fam_male_onset_age !== null && le(x.fam_male_onset_age, 55))
    || (x.fam_female_onset_age !== null && le(x.fam_female_onset_age, 65));
}

// ── 代謝症候群（MS-1～MS-5，F p.39 六）──
function metabolic(x) {
  const items = [];
  let unknown = 0;
  const push = (ruleId, ok, text) => {
    if (ok === null) unknown++;
    items.push(item(ruleId, text, `F p.39 心血管風險因子定義 六`, { met: ok, auto: true }));
  };
  push('MS-1', x.waist === null ? false : x.sex === null ? null : x.sex === 'M' ? x.waist >= 90 : x.waist >= 80,
    '腹部肥胖（男性≧90cm，女性≧80cm）');
  const bp = DECISIONS.Q8_bpEitherSbpOrDbp
    ? (x.sbp !== null && x.sbp >= 130) || (x.dbp !== null && x.dbp >= 85)
    : x.sbp !== null && x.dbp !== null && x.sbp >= 130 && x.dbp >= 85;
  push('MS-2', bp || !!x.on_antihtn, '血壓偏高（≧130/85mmHg 或使用高血壓藥物）');
  push('MS-3', (x.fpg !== null && x.fpg >= 100) || !!x.on_dm_drug, '空腹血糖偏高（≧100mg/dL 或使用糖尿病藥物）');
  push('MS-4', (x.tg !== null && x.tg >= 150) || !!x.on_tg_drug, '空腹 TG 偏高（≧150mg/dL 或使用治療 TG 血脂藥物）');
  push('MS-5', hdlLow(x), 'HDL-C 偏低（男性<40mg/dL，女性<50mg/dL）');
  const count = items.filter((i) => i.met === true).length;
  return { count, unknown, items, met: count >= 3, indeterminate: count < 3 && count + unknown >= 3 };
}

// ── 表一 心血管風險因子（RF-1～RF-6，F p.39）──
function riskFactors(x, mets) {
  const cite = 'F p.39 心血管風險因子定義';
  const rf = [];
  const add = (ruleId, met, text, auto = false) => rf.push(item(ruleId, text, `${cite}`, { met, auto }));
  add('RF-1', !!x.htn, '高血壓');
  add('RF-2', x.sex === null || x.age === null ? null : x.sex === 'M' ? x.age >= 45 : x.age >= 55, '男性≧45歲，女性≧55歲', true);
  add('RF-3', famHx(x), '早發性冠心病家族史（男性≦55歲，女性≦65歲）', true);
  add('RF-4', hdlLow(x), 'HDL-C：男性<40mg/dL，女性<50mg/dL', true);
  add('RF-5', !!x.smoking, '抽菸');
  add('RF-6', mets.met ? true : mets.indeterminate ? null : false, `代謝性症候群（符合 ${mets.count} 項，需至少三項）`, true);
  if (!DECISIONS.Q7_hdlDoubleCount && rf[3].met && mets.items[4].met && mets.count === 3) rf[5].met = false;
  return rf;
}

// ── 表一 風險分層（TIER-ORDER，F p.38–39）──
function classify(x) {
  const P38 = 'F p.38 ASCVD 風險等級定義';
  const ex = [];
  if (x.cad) {
    const subs = [['mi_within_1y', '1.一年內曾經歷心肌梗塞'], ['mi_count_ge2', '2.≧兩次心肌梗塞病史'],
      ['multivessel_cad', '3.多支冠狀動脈阻塞'], ['acs_with_dm', '4.急性冠心症合併糖尿病'], ['pad_or_carotid', '5.周邊動脈疾病或頸動脈狹窄']];
    for (const [k, t] of subs) if (x[k]) ex.push(item('EX-1', `冠狀動脈疾病合併 ${t}`, `${P38} 一(一)`, { sub: k }));
  }
  if (x.pad) {
    if (x.pad_with_cad) ex.push(item('EX-2', '周邊動脈疾病合併 1.冠狀動脈疾病', `${P38} 一(二)`, { sub: 'pad_with_cad' }));
    if (x.pad_with_carotid) ex.push(item('EX-2', '周邊動脈疾病合併 2.頸動脈狹窄', `${P38} 一(二)`, { sub: 'pad_with_carotid' }));
  }
  const vh = [];
  if (x.acs_history) vh.push(item('VH-1', '急性冠心症病史', `${P38} 二(一)1`));
  if (x.revasc_pci_or_cabg) vh.push(item('VH-2', '接受血管再通術（心導管介入治療或外科冠狀動脈繞道手術）', `${P38} 二(一)2`));
  if (x.stroke_tia && x.athero_related) vh.push(item('VH-3', '缺血性中風／短暫性腦缺血發作合併動脈硬化相關疾病或病史', `${P38} 二(一)3`));
  if (x.pad_severe) vh.push(item('VH-4', '周邊動脈疾病（曾接受血管再通術、有肢體缺血相關症狀或截肢）', `${P38} 二(一)4`));
  if (x.imaging_stenosis_ge50) vh.push(item('VH-5', '經影像檢查確認 ≧50% 直徑狹窄率', `${P38} 二(二)`));

  const notes = [];
  const hi = [];
  if (x.dm) hi.push(item('HI-1', '糖尿病', 'F p.39 三(一)'));
  if (x.ckd_predialysis && x.dialysis && DECISIONS.Q17_dialysisExcludesCkd) {
    notes.push(item('HI-2', 'CKD 高風險條件限「進入透析治療前」，不適用透析病人（Q17）', 'F p.39 三(二)'));
  } else if (x.ckd_predialysis) {
    hi.push(item('HI-2', '慢性腎臟病（透析前；UACR≧30mg/g 或 eGFR<60，不論依據 UACR 或 eGFR，皆須至少持續 3 個月）', 'F p.39 三(二)'));
  }
  if (x.ldl !== null && x.ldl >= 190) hi.push(item('HI-3', `LDL-C≧190mg/dL（基線 ${x.ldl}）`, 'F p.39 三(三)', { auto: true }));
  if (x.cac !== null && x.cac >= 400) hi.push(item('HI-4', `冠狀動脈鈣化分數(CAC)≧400（${x.cac}）`, 'F p.39 三(四)', { auto: true }));

  const mets = metabolic(x);
  const rf = riskFactors(x, mets);
  const rfCount = rf.filter((r) => r.met === true).length;
  const rfUnknown = rf.filter((r) => r.met === null).length;

  const base = { mets, rf, rfCount, notes };
  const tierOf = (id, basis) => ({ ...base, tier: { id, label: T1[id].label, status: 'ok', basis } });

  if (ex.length) return tierOf('EX', ex);
  if (vh.length) return tierOf('VH', vh);

  // 勾了 CAD／PAD 主診斷或中風／TIA，但極高、非常高皆不成立 → 視同未勾，照常往下判（Q4、Q18）；只附中性附註
  const UNLISTED = { cad: '冠狀動脈疾病', pad: '周邊動脈疾病', stroke_tia: '缺血性中風／短暫性腦缺血發作' };
  const unlisted = Object.keys(UNLISTED).filter((k) => x[k]);
  if (DECISIONS.Q4Q18_unlistedAsUnchecked && unlisted.length) {
    notes.push(item('TIER-UNLISTED', `已勾選${unlisted.map((k) => UNLISTED[k]).join('、')}，但未符合極高／非常高風險列舉條件，未計入風險分層（Q4、Q18）。`,
      `${P38} 一、二`, { unlisted }));
    if (unlisted.includes('cad')) notes.push(item('TIER-IMG', '若有影像檢查確認 ≧50% 直徑狹窄，請改勾非常高風險（二）。', `${P38} 二(二)`));
  }

  if (hi.length) return tierOf('HI', hi);

  const rfBasis = rf.filter((r) => r.met === true);
  if (rfUnknown > 0) {
    // 未知因子可能改變層級（C14）→ 不猜
    const lo = rfCount, hiCount = rfCount + rfUnknown;
    const pick = (n) => (n >= 2 ? 'MOD' : n === 1 ? 'LOW' : 'ZERO');
    if (pick(lo) !== pick(hiCount)) {
      const missing = rf.filter((r) => r.met === null).map((r) => r.ruleId).join('、');
      notes.push(item('TOOL-NOSEX', `${missing} 需性別／年齡才能自動判定，請補性別與年齡；目前可判項目為 ${lo} 項。`, 'F p.39 心血管風險因子定義'));
      return { ...base, tier: { id: null, label: '無法自動判定（缺性別／年齡）', status: 'undetermined', basis: rfBasis,
        reason: { text: '缺性別或年齡，心血管風險因子無法完整計數。', cite: 'F p.39 心血管風險因子定義' } } };
    }
  }
  const id = rfCount >= 2 ? 'MOD' : rfCount === 1 ? 'LOW' : 'ZERO';
  const tierRule = { MOD: ['MOD-1', '2項(含)以上心血管風險因子', 'F p.39 四'],
    LOW: ['LOW-1', '1項心血管風險因子', 'F p.39 五'], ZERO: ['ZERO-1', '0項心血管風險因子', 'F p.37 表一／0項列'] }[id];
  return tierOf(id, [...rfBasis, item(tierRule[0], `${tierRule[1]}（計 ${rfCount} 項）`, tierRule[2], { auto: true })]);
}

// reference：UI 據此附「statin 強度參考（非健保定義）」展開表；不參與判定
const RX_INTENSITY = item('RX-INTENSITY', '「中強度／高強度 statin」的劑量：給付規定未定義強度劑量。', 'F p.37 表一（無定義）', { reference: 'statin_intensity' });

// ── 表一 處方規定、評估建議（F p.37–39）──
function table1Rx(id, x) {
  const P37 = 'F p.37 表一處方規定';
  const statin = [];
  const follow = [];
  if (id === 'EX' || id === 'VH') {
    statin.push(item('RX-EV-1', '起始治療：依據基線血脂值、用藥史和臨床狀況，給予中至高強度 statin 或合併 ezetimibe。', `${P37}（極高、非常高風險）一`));
    follow.push(item('RX-EV-2', '起始治療 6–8 週後檢測血脂：達標則維持，每 6 個月追蹤；未達標則檢視服藥狀況，考慮調整至高強度 statin 或最大耐受 statin 劑量，同時考慮合併 non-statin（ezetimibe、PCSK9 單株抗體、siRNA、ATP citrate lyase 抑制劑）。', `${P37}（極高、非常高風險）二`));
    follow.push(item('RX-EV-3', '更動治療 1–3 個月內追蹤是否達標：達標則維持，每 6 個月追蹤；未達標則檢視服藥狀況，考慮調整藥物組合。', `${P37}（極高、非常高風險）三`));
    follow.push(item('AS-EV-1', '初始評估應檢測完整血脂指標，並應於急性病人入院後24小時內完成血脂檢驗。', 'F p.39 各風險等級評估建議 一(一)', { emphasis: !!x.acute_inpatient }));
    follow.push(item('AS-EV-2', '處置各項可改善心血管風險因子：血壓、HbA1c、肥胖、抽菸、酒精攝取、生活型態。', 'F p.39 各風險等級評估建議 一(二)'));
  } else if (id === 'HI') {
    statin.push(item('RX-HI-1', '起始治療：依據基線血脂值與臨床狀況，給予中至高強度 statin 或合併 ezetimibe；同時進行生活型態改變。', `${P37}（高風險）一`));
    follow.push(item('RX-HI-2', '起始治療 6–8 週後檢測血脂：達標則維持，每 6 個月追蹤；未達標則檢視服藥狀況，考慮高強度 statin 或最大耐受 statin 劑量或同時合併 non-statin（ezetimibe、PCSK9 單株抗體、siRNA、ATP citrate lyase 抑制劑）。', `${P37}（高風險）二`));
    follow.push(item('RX-HI-3', '更動治療 1–3 個月內追蹤是否達標：達標則維持，每 6 個月追蹤；未達標則檢視服藥狀況，考慮調整藥物組合。', `${P37}（高風險）三`));
  } else {
    const q6 = id === 'ZERO' ? '（0 項列比照中、低風險，Q6）' : '';
    statin.push(item('RX-ML-1', `起始治療：進行生活型態改變，並處置心血管風險因子${q6}。`, `F p.37–38 表一處方規定（中、低風險）一`));
    follow.push(item('RX-ML-2', '起始治療 3–6 個月後檢測血脂：達標則維持，每 6–12 個月追蹤；未達標則給予中強度 statin。', 'F p.38 表一處方規定（中、低風險）二'));
    follow.push(item('RX-ML-3', '中強度 statin 治療 6–8 週後追蹤：達標則維持，每 6–12 個月追蹤；未達標則檢視服藥狀況，可給予高強度 statin 或最大耐受 statin 劑量或合併 non-statin。', 'F p.38 表一處方規定（中、低風險）三'));
  }
  if (id === 'HI' || id === 'MOD' || id === 'LOW' || (id === 'ZERO' && DECISIONS.Q6_zeroFollowsModLow)) {
    follow.push(item('AS-ML-1', '給予完整血脂指標檢測，辨識各項可改善心血管風險因子：血壓、HbA1c、肥胖、抽菸、酒精攝取、生活型態。', 'F p.39 各風險等級評估建議 二(一)'));
  }
  if (id === 'HI' && x.fh_features) {
    follow.push(item('AS-FH', '高風險且有嚴重高膽固醇血症、肌腱黃色瘤、早發心血管疾病或家族病史：應依台灣家族性高膽固醇血症診斷標準進行篩檢（診斷標準本身未收錄於給付規定）。', 'F p.39 各風險等級評估建議 二(二)', { missingSource: true }));
  }
  statin.push(RX_INTENSITY);
  return { statin, follow };
}

const NONPHARM = {
  EX: ['處置各項可改善心血管風險因子，與藥物治療並行', false],
  VH: ['處置各項可改善心血管風險因子，與藥物治療並行', false],
  HI: ['生活型態改變與藥物治療並行', false],
  MOD: ['給藥前應有3-6個月生活型態改變，並處置心血管風險因子', true],
  LOW: ['給藥前應有3-6個月生活型態改變，並處置心血管風險因子', true],
  ZERO: ['給藥前應有3-6個月生活型態改變，並處置心血管風險因子', true],
};

function evalTable1(x) {
  const c = classify(x);
  const out = { tier: c.tier, rf: c.rf, rfCount: c.rfCount, mets: c.mets, notes: c.notes, lockedSections: [],
    eligibility: null, targets: null, nonPharm: null, followUp: [], statinItems: [] };

  if (c.tier.status === 'undetermined') {
    out.eligibility = { status: 'undetermined', text: '本工具無法判定：請補性別與年齡', gap: null, lifestyleFirst: null, ruleId: 'TOOL-NOSEX', cite: c.tier.reason.cite };
    out.targets = { ldl: { value: null, met: null }, nonhdl: { value: null, calc: null, met: null } };
    return out;
  }

  const id = c.tier.id;
  const T = T1[id];
  const cite = `F p.37 表一／${T.row}`;
  out.lockedSections = SECTIONS.slice(SECTIONS.indexOf(SECTION_OF[id]) + 1);
  out.nonPharm = item(`T1-${id}`, NONPHARM[id][0], cite);
  const lifestyleFirst = NONPHARM[id][1];
  const start = T.start;

  if (x.ldl === null) {
    out.eligibility = { status: 'need_ldl', text: '需 LDL-C（開始藥物治療前）才能判定', gap: null, lifestyleFirst, start, ruleId: 'TOOL-NOLDL', cite };
  } else if (x.ldl >= T.start) {
    out.eligibility = { status: 'eligible', text: lifestyleFirst ? `符合起始藥物治療血脂值（LDL-C≧${T.start}），但給藥前應有 3–6 個月生活型態改變` : `符合起始藥物治療血脂值（LDL-C≧${T.start}）`,
      gap: 0, lifestyleFirst, start, ruleId: 'T1-ELIG', cite };
  } else {
    const gap = T.start - x.ldl;
    out.eligibility = { status: 'not_yet', text: `尚未達起始藥物治療血脂值（LDL-C≧${T.start}，差 ${gap} mg/dL）`, gap, lifestyleFirst, start, ruleId: 'T1-NOT', cite };
  }

  const cur = x.ldl_current;
  const ldlMet = cur === null ? null : cur < T.ldlT;
  const calc = x.tc !== null && x.hdl !== null ? x.tc - x.hdl : null;
  const nonhdlMet = T.nonhdlT === null || calc === null || ldlMet !== true ? null : calc < T.nonhdlT;
  out.targets = {
    ldl: { value: T.ldlT, met: ldlMet, current: cur, text: `LDL-C<${T.ldlT}mg/dL`, ruleId: `T1-${id}`, cite },
    nonhdl: { value: T.nonhdlT, calc, met: nonhdlMet, ruleId: 'NONHDL-1',
      text: T.nonhdlT === null ? '條文未列' : `non-HDL-C<${T.nonhdlT}mg/dL（LDL-C 達標後的次要標的）`,
      cite: T.nonhdlT === null ? cite : `${cite}；F p.39 末段` },
  };
  const rx = table1Rx(id, x);
  out.statinItems = rx.statin;
  out.followUp = rx.follow;
  if (x.sex === null) out.notes.push(item('TOOL-NOSEX', '性別未填：RF-2／RF-4／代謝症候群相關項目未自動判定（本例不影響層級）。', 'F p.39 心血管風險因子定義'));
  return out;
}

// ── 表二（F p.40）──
function evalTable2(x) {
  const P40 = 'F p.40 表二';
  const tf = [];
  const add = (ruleId, met, text) => tf.push(item(ruleId, text, 'F p.40 危險因子定義', { met }));
  add('T2-RF-1', !!x.htn, '高血壓');
  const agePart = x.sex === null || x.age === null ? null : x.sex === 'M' ? x.age >= 45 : x.age >= 55;
  const meno = DECISIONS.Q1_t2PostmenopauseCounts && x.sex === 'F' && !!x.postmenopausal;
  add('T2-RF-2', agePart === true || meno ? true : agePart, '男性≧45歲，女性≧55歲或停經者');
  add('T2-RF-3', famHx(x), '有早發性冠心病家族史（男性≦55歲，女性≦65歲）');
  add('T2-RF-4', x.hdl !== null && x.hdl < 40, 'HDL-C<40mg/dL（不分性別）');
  add('T2-RF-5', !!x.smoking, '吸菸');
  const rfCount = tf.filter((r) => r.met === true).length;
  const rfUnknown = tf.filter((r) => r.met === null).length;

  const ROWS = [
    { id: 'T2-1', label: '有急性冠狀動脈症候群病史，或曾接受心導管介入治療／外科冠動脈搭橋手術之冠狀動脈粥狀硬化患者', when: () => x.acs_history || x.revasc_pci_or_cabg, ldl: 70, tc: null, lifestyle: false, cite: `${P40}／第1列` },
    { id: 'T2-2', label: '心血管疾病或糖尿病患者', when: () => x.t2_cvd || x.dm, ldl: 100, tc: 160, lifestyle: false, cite: `${P40}／第2列` },
    { id: 'T2-3', label: '2個危險因子或以上', when: () => rfCount >= 2, ldl: 130, tc: 200, lifestyle: true, cite: `${P40}／第3列` },
    { id: 'T2-4', label: '1個危險因子', when: () => rfCount === 1, ldl: 160, tc: 240, lifestyle: true, cite: `${P40}／第4列` },
    { id: 'T2-5', label: '0個危險因子', when: () => rfCount === 0, ldl: 190, tc: null, lifestyle: true, cite: `${P40}／第5列` },
  ];
  const row = ROWS.find((r) => r.when());
  const T2RX = item('T2-RX', '第一年應每3-6個月抽血檢查一次，第二年以後應至少每6-12個月抽血檢查一次，同時請注意副作用之產生如肝功能異常，橫紋肌溶解症。', `${P40}／處方規定欄（跨全部列）`);
  if (row.id !== 'T2-1' && row.id !== 'T2-2' && rfUnknown > 0) {
    // 未知因子可能改變列別 → 不猜（比照表一 C14；S9 Codex r1）
    const rowAt = (n) => (n >= 2 ? 'T2-3' : n === 1 ? 'T2-4' : 'T2-5');
    if (rowAt(rfCount) !== rowAt(rfCount + rfUnknown)) {
      const cite = 'F p.40 危險因子定義';
      return { row: { id: null, label: '無法判定（缺性別／年齡）', cite }, rf: tf, rfCount, nonPharm: null, followUp: [T2RX],
        notes: [item('TOOL-NOSEX', `表二危險因子「男性≧45歲，女性≧55歲或停經者」需性別與年齡才能判定，可能改變列別；目前可判項目為 ${rfCount} 項。`, cite)],
        eligibility: { status: 'undetermined', gap: null, lifestyleFirst: null, ruleId: 'TOOL-NOSEX', cite, need: 'needs sex/age', text: '本工具無法判定：請填性別、年齡（表二危險因子「男性≧45歲，女性≧55歲或停經者」可能改變列別）' },
        targets: { ldl: { value: null, met: null }, tc: { value: null, met: null }, nonhdl: { value: null, text: '表二未列' } } };
    }
  }
  const out = { row: { id: row.id, label: row.label, cite: row.cite }, rf: tf, rfCount, notes: [], followUp: [T2RX] };
  if (row.id !== 'T2-1' && row.id !== 'T2-2' && rfUnknown > 0) {
    out.notes.push(item('TOOL-NOSEX', '性別或年齡未填：表二危險因子「男性≧45歲，女性≧55歲或停經者」未判定（本例不影響列別）。', 'F p.40 危險因子定義'));
  }
  if (x.smoking && row.id !== 'T2-1' && row.id !== 'T2-2') {
    out.notes.push(item('T2-RF-5', '「因吸菸而符合起步治療準則之個案，若未戒菸而要求藥物治療，應以自費治療」（此條只見於表二危險因子定義，表一無此規定）。', 'F p.40 危險因子定義 5'));
  }
  out.nonPharm = item(row.id, row.lifestyle ? '給藥前應有3-6個月非藥物治療' : '與藥物治療可並行', row.cite);

  // 起始：任一值達標即符合（Q2）；未達的一方另一值未填 → 不判不符合（S9 Codex r1）
  const ldlHit = x.ldl !== null && x.ldl >= row.ldl;
  const tcHit = row.tc !== null && x.tc !== null && x.tc >= row.tc;
  const tcMissing = row.tc !== null && x.tc === null;
  const startText = row.tc === null ? `LDL-C≧${row.ldl}` : `TC≧${row.tc} 或 LDL-C≧${row.ldl}`;
  if (ldlHit || tcHit) {
    out.eligibility = { status: 'eligible', gap: 0, lifestyleFirst: row.lifestyle, ruleId: row.id, cite: row.cite,
      text: `符合起始藥物治療血脂值（${startText}）${row.lifestyle ? '，但給藥前應有 3–6 個月非藥物治療' : ''}` };
  } else if (x.ldl === null) {
    out.eligibility = { status: 'need_ldl', gap: null, lifestyleFirst: row.lifestyle, ruleId: 'TOOL-NOLDL', cite: row.cite, text: `需 LDL-C${tcMissing ? '或 TC' : ''} 才能判定` };
  } else if (tcMissing) {
    out.eligibility = { status: 'undetermined', gap: null, lifestyleFirst: row.lifestyle, ruleId: 'TOOL-NOTC', cite: row.cite, need: 'TC needed',
      text: `本工具無法判定：LDL-C 未達 ${row.ldl}，請填 TC（起始條件為 ${startText}）` };
  } else {
    const gap = x.ldl !== null ? row.ldl - x.ldl : null;
    out.eligibility = { status: 'not_yet', gap, lifestyleFirst: row.lifestyle, ruleId: row.id, cite: row.cite,
      text: `尚未達起始藥物治療血脂值（${startText}${gap !== null ? `；LDL-C 差 ${gap} mg/dL` : ''}）` };
  }

  const cur = x.ldl_current;
  const ldlMet = cur === null ? null : cur < row.ldl;
  const tcMet = row.tc === null || x.tc === null || cur === null ? null : x.tc < row.tc;
  out.targets = {
    ldl: { value: row.ldl, met: ldlMet, current: cur, text: `LDL-C<${row.ldl}mg/dL`, ruleId: row.id, cite: row.cite },
    tc: { value: row.tc, met: tcMet, text: row.tc === null ? '表二未列 TC 目標' : `TC<${row.tc}mg/dL（表二目標寫「TC 或 LDL-C」；本工具以 LDL-C 判達標，Q2）`, ruleId: row.id, cite: row.cite },
    nonhdl: { value: null, text: '表二未列' },
  };
  if (ldlMet !== null && tcMet !== null && ldlMet !== tcMet) {
    out.notes.push(item(row.id, `TC 與 LDL-C 達標結論不一致（LDL-C ${ldlMet ? '已' : '未'}達標、TC ${tcMet ? '已' : '未'}達標）；本工具以 LDL-C 為準（Q2），請自行確認。`, row.cite));
  }
  return out;
}

// ── 2.6.2 ezetimibe、2.6.3 複方（F p.41）──
const EZE_LIST = 'AC60610100 Ezetity、BC27311100 Ezzicad、BC28252100 Ezta 10、BC26552100 Ezetimibe Sandoz';
const CMB_LIST = 'AC59251100 Agitin 10/20、AC60402100 Sacure 10/20、BC28502100 Ezta-SM 10+20、AC62052100 Zoliton 10/20、AC62053100 Zoliton 10/10、AC62140100 Zovastin 10/10、AC62139100 Zovastin 10/20、BC28181100 Cretrol 10/10、BC28182100 Cretrol 10/20、BC28884100 Livazebe HD';

// 「經使用 statin 單一治療 6-8 週（或清單品項 3 個月）未達治療目標」共用判定
function monoPath(x, ctx, { listed, ruleB, ruleList, list, cite, drugWord }) {
  const minW = DECISIONS.Q11_minMonoWeeks;
  const w = x.statin_mono_weeks;
  const items = [];
  if (w === null || w < minW) {
    items.push(item(ruleB, `需先經 statin 單一治療 6-8 週未達治療目標（目前 ${w === null ? '未填／未使用' : `${w} 週`}；以 ≧${minW} 週起算，Q11）。`, cite));
    if (listed !== 'no') items.push(item(ruleList, `若為清單品項（${list}），需 statin 單一治療 3 個月未達治療目標。`, cite));
    return { status: 'not_yet', items };
  }
  if (ctx.ldlMet === null) {
    items.push(item(ruleB, '需「目前 LDL-C」（治療中）才能判斷是否未達治療目標。', cite));
    return { status: 'undetermined', items };
  }
  if (ctx.ldlMet === true) {
    items.push(item(ruleB, `已達治療目標（目前 LDL-C ${ctx.cur} < ${ctx.target}，${ctx.targetCite}），不符合本款「未達治療目標」（Q10）。`, cite));
    return { status: 'not_eligible', items };
  }
  const notMet = `statin 單一治療 ${w} 週、目前 LDL-C ${ctx.cur} 未達治療目標 <${ctx.target}（${ctx.targetCite}，Q10）`;
  // 3 個月仍以勾選框判定、不以週數換算；週數 ≧13 而未勾時只提示（S8 F2）
  const hint3m = () => { if (w >= 13) items.push(item('MONO-3M-HINT', `已填 statin 單一治療 ${w} 週，若已滿 3 個月請勾選「statin 單一治療已滿 3 個月」（本工具不以週數換算月數）。`, cite)); };
  if (listed === 'yes') {
    if (x.statin_mono_ge3m) {
      items.push(item(ruleList, `清單品項：${notMet}，且已滿 3 個月 → 符合，${drugWord}。`, cite));
      return { status: 'eligible', items };
    }
    items.push(item(ruleList, `清單品項（${list}）需 statin 單一治療 3 個月未達治療目標；尚未滿 3 個月。`, cite));
    hint3m();
    return { status: 'not_yet', items };
  }
  items.push(item(ruleB, `${notMet} → 符合，${drugWord}。`, cite));
  if (listed === 'unsure' && !x.statin_mono_ge3m) {
    items.push(item(ruleList, `品項不確定：若為清單品項（${list}），需滿 3 個月才符合。`, cite));
    hint3m();
    return { status: 'conditional', items };
  }
  return { status: 'eligible', items };
}

const Q12_NOTE = (cite) => item('Q12', '保守解讀：仍要求符合表一／表二起始條件（公告版已刪「符合全民健康保險降血脂藥物給付規定表」字樣，第 82 次共擬會議通過版保留）（Q12）。',
  `${cite}；共擬會議藥品部分第82次會議紀錄 p.50–51`);

function tableGate(ctx) {
  // Q12：仍須先符合表一（或表二）起始條件
  if (!DECISIONS.Q12_requireTableEligibility) return null;
  if (ctx.elig === 'eligible') return null;
  if (ctx.elig === 'not_yet') return { status: 'not_eligible', text: `病人尚未符合${ctx.tableName}起始藥物治療血脂值（Q12）。` };
  return { status: 'undetermined', text: `${ctx.tableName}起始條件無法判定，故本項無法判定（Q12）。` };
}

function evalEzetimibe(x, ctx) {
  const cite = 'F p.41 2.6.2';
  const items = [];
  const ind = x.dx_primary_hc || x.dx_hofh || x.dx_sitosterolemia;
  if (!ind) {
    return { status: 'not_yet', items: [item('EZE-IND', '需先確認診斷（原發性高膽固醇血症／HoFH／同型接合子性麥脂醇血症）：本品限用於原發性高膽固醇血症、同型接合子家族性高膽固醇血症、同型接合子性麥脂醇血症（植物脂醇血症）患者；未勾選以上診斷。', cite)] };
  }
  items.push(item('EZE-IND', '適應症成立（原發性高膽固醇血症／HoFH／同型接合子性麥脂醇血症）。', cite));
  if (DECISIONS.Q12_requireTableEligibility) items.push(Q12_NOTE(cite));
  const gate = tableGate(ctx);
  if (gate) return { status: gate.status, items: [...items, item('EZE-TABLE', gate.text, ctx.tableCite)] };
  if (x.statin_intolerant) {
    items.push(item('EZE-A', '對 statins 類藥品發生無法耐受藥物不良反應（如 Severe myalgia、Myositis）→ 符合第1款，無等待期。', `${cite} 第1款`));
    return { status: 'eligible', items };
  }
  if (x.statin_contraindicated) {
    items.push(item('EZE-CI', 'statin 禁忌症：2.6.2 第1款只寫「無法耐受藥物不良反應」，2.6.2 未明列禁忌症，請依個案申報（本工具不改判定）。', `${cite} 第1款`));
  }
  const p = monoPath(x, ctx, { listed: x.eze_listed, ruleB: 'EZE-B', ruleList: 'EZE-B-LIST', list: EZE_LIST, cite: `${cite} 第2款`, drugWord: '得合併使用 ezetimibe 與 statin' });
  if (DECISIONS.Q16_ezeByArticle262 && ctx.tierIsT1) {
    p.items.push(item('Q16', '表一處方規定寫「中至高強度 statin 或合併 ezetimibe」；本工具 ezetimibe 給付依 2.6.2 專條判定（Q16）。', 'F p.37 表一處方規定；F p.41 2.6.2'));
  }
  return { status: p.status, items: [...items, ...p.items] };
}

function evalCombo(x, ctx) {
  const cite = 'F p.41 2.6.3';
  const items = [];
  if (x.on_gemfibrozil) {
    return { status: 'forbidden', items: [item('CMB-GEM', '本品不得與 gemfibrozil 併用（ezetimibe 單方不受此款限制）。', `${cite} 第3款`)] };
  }
  if (!(x.dx_primary_hc || x.dx_hofh)) {
    if (x.dx_sitosterolemia) {
      return { status: 'not_eligible', items: [item('CMB-IND', '限用於原發性高膽固醇血症、同型接合子家族性高膽固醇血症（HOFH）病患（2.6.3 未列麥脂醇血症）。', `${cite} 第1款`)] };
    }
    return { status: 'not_yet', items: [item('CMB-IND', '需先確認診斷（原發性高膽固醇血症／HoFH）：本類複方限用於原發性高膽固醇血症、同型接合子家族性高膽固醇血症（HOFH）病患；未勾選以上診斷。', `${cite} 第1款`)] };
  }
  items.push(item('CMB-IND', '適應症成立（原發性高膽固醇血症／HoFH）。', `${cite} 第1款`));
  if (DECISIONS.Q12_requireTableEligibility) items.push(Q12_NOTE(cite));
  const gate = tableGate(ctx);
  if (gate) return { status: gate.status, items: [...items, item('CMB-TABLE', gate.text, ctx.tableCite)] };
  if (x.statin_intolerant) {
    items.push(item('CMB-NOINTOL', '2.6.3 無「statin 不耐受」給付路徑（與 2.6.2 不同）；不耐受者無複方給付路徑。', cite));
    return { status: 'not_eligible', items };
  }
  const p = monoPath(x, ctx, { listed: x.cmb_listed, ruleB: 'CMB-B', ruleList: 'CMB-B-LIST', list: CMB_LIST, cite: `${cite} 第2款`, drugWord: '得使用本類複方' });
  return { status: p.status, items: [...items, ...p.items] };
}

// ── 2.6.4 PCSK9（F p.42–43）＋附表二-D（F p.277–278）──
const EVENT_LABEL = { mi: '心肌梗塞', revasc: '冠狀動脈或其他動脈血管再通術', stroke: '動脈硬化相關之缺血性腦中風' };
// 區 2／3 中屬 PCSK9 事件範圍的勾選（F1 提醒用；子項只在主項勾選時算，與 classify() 一致）
const PCSK9_EVT_CHECKS = [
  { sec: 2, label: '一年內曾經歷心肌梗塞', on: (x) => x.cad && x.mi_within_1y },
  { sec: 2, label: '≧兩次心肌梗塞病史', on: (x) => x.cad && x.mi_count_ge2 },
  { sec: 3, label: '接受血管再通術（心導管介入治療或外科冠狀動脈繞道手術）', on: (x) => x.revasc_pci_or_cabg },
  { sec: 3, label: '缺血性中風／短暫性腦缺血發作＋合併動脈硬化相關疾病或病史', on: (x) => x.stroke_tia && x.athero_related },
];
const A2D_LDL = item('A2D-LDL', '申請時檢附 LDL-C 報告：首次申請附申請前一年內所有 LDL-C 之報告；再次申請附首次使用 PCSK9 調節劑治療前之 LDL-C 報告及前次治療期間所有 LDL-C 之報告。', 'F p.278 附表二-D 3.3、3.4');

function maceCheck(x, ids) {
  // ids: { evt, I, II } 規則 ID；回傳 { status, items }
  const cite = ids.cite;
  const items = [];
  const a2d31 = `${ids.evtCite}；F p.277 附表二-D 3.1`;
  if (!EVENT_LABEL[x.major_cv_event]) {
    // 只陳述「未選擇」，不斷言病人沒發生事件（S8 F1）
    items.push(item(ids.evt, '第 8 區未選擇重大心血管事件（PCSK9 適用範圍：心肌梗塞、血管再通術、動脈硬化相關缺血性中風）→ 本路徑未評估。附表二-D 3.1 只列這三項；TIA、未合併心肌梗塞之急性冠心症、單純影像狹窄不在其列。', a2d31));
    // 區 2／3 已勾屬此範圍的項目 → 提醒；不自動帶入（PCSK9 範圍比表一窄，由醫師確認）
    const checked = PCSK9_EVT_CHECKS.filter((c) => c.on(x)).map((c) => `第 ${c.sec} 區已勾「${c.label}」`);
    if (checked.length) items.push(item('PCSK9-EVT-HINT', `${checked.join('、')}，若要評估 PCSK9 請於第 8 區選擇事件類型。`, a2d31));
    return { status: 'not_eligible', items };
  }
  // Q14（user 裁定）：「一年內」依附表二-D 3.1＝事件後一年內開始使用最大耐受劑量 statin；只適用首次申請
  items.push(item('Q14', '2.6.4 總述：「限給付於發生重大心血管事件之後一年內且使用最大耐受劑量statin之病人」；附表二-D 3.1：「首次申請限給付於在發病後一年內開始使用最大耐受劑量statin之病人」。本工具依 3.1 以「事件後一年內是否已開始使用最大耐受劑量 statin」判定，不以申請日距事件月數判定；此限制只適用首次申請，再次申請（續用）不適用（Q14）。', a2d31));
  const pathII = x.statin_contraindicated || x.statin_intolerant;
  if (DECISIONS.Q14_statinStartWithin1y && pathII && DECISIONS.Q20_pcsk9PathIINoStatin) {
    // Q14 路徑 II（user 2026-10-30）：最大耐受劑量可為零（Q20）→ 此題不必回答，視為符合
    items.push(item(ids.evt, `路徑 II（statin 禁忌症或確診不耐受）：最大耐受劑量可為零（Q20），「${EVENT_LABEL[x.major_cv_event]}後一年內是否已開始使用最大耐受劑量 statin」不必回答，視為符合；申請時應敘明 statin 禁忌症／不耐受理由（Q14）。`, a2d31));
  } else if (DECISIONS.Q14_statinStartWithin1y && x.max_statin_within_1y === null) {
    items.push(item(ids.evt, `需回答「${EVENT_LABEL[x.major_cv_event]}後一年內是否已開始使用最大耐受劑量 statin」，才能判定首次申請條件（Q14）。`, a2d31));
    return { status: 'undetermined', items };
  } else if (DECISIONS.Q14_statinStartWithin1y && x.max_statin_within_1y === 'no') {
    items.push(item(ids.evt, `${EVENT_LABEL[x.major_cv_event]}後一年內未開始使用最大耐受劑量 statin → 不符合首次申請條件（Q14）。`, a2d31));
    return { status: 'not_eligible', items };
  }
  if (x.age === null || x.age < 20) {
    items.push(item(ids.evt, '條文限「成人病人」，未定義年齡；請自行確認。', ids.evtCite));
    return { status: 'undetermined', items };
  }
  if (!pathII) items.push(item(ids.evt, `${EVENT_LABEL[x.major_cv_event]}後一年內已開始使用最大耐受劑量 statin（Q14）。`, a2d31));
  const cur = x.ldl_current;
  if (cur === null) {
    items.push(item(ids.I, '需「目前 LDL-C」（治療中）才能判定「LDL-C 仍高於100 mg/dL」。', cite));
    return { status: 'undetermined', items };
  }
  const ldlOk = cur > 100;
  const eze3 = x.eze_add_on_months !== null && x.eze_add_on_months >= 3;
  const st3 = x.high_or_max_statin_months !== null && x.high_or_max_statin_months >= 3;
  if (pathII) {
    const noStatin = DECISIONS.Q20_pcsk9PathIINoStatin;
    const ok = eze3 && ldlOk && (noStatin || st3);
    items.push(item(ids.II, `對 statin 有禁忌症或確診不耐受，經其他降血脂藥物（至少需有 ezetimibe 10 mg）持續治療 3 個月（目前 ${x.eze_add_on_months ?? '未填'} 個月），LDL-C 仍高於 100（目前 ${cur}）→ ${ok ? '符合' : '不符合'}。`, ids.IICite));
    items.push(item('Q20', noStatin
      ? '入口句「使用最大耐受劑量 statin 之病人」：statin 禁忌症／不耐受者的最大耐受劑量可為零，本路徑不要求正在使用 statin（Q20）。總述字面另有「使用最大耐受劑量statin」，路徑 II 申請時應敘明 statin 禁忌症／不耐受理由。'
      : `入口句「使用最大耐受劑量 statin 之病人」：本路徑仍要求最大耐受劑量 statin ≧3 個月（目前 ${x.high_or_max_statin_months ?? '未填'}）（Q20）。`, `${ids.evtCite}；F p.277 附表二-D 3.2(2)(3)`));
    items.push(item('A2D-INTOL', '附表二-D statin 不耐受認定：嚴重橫紋肌溶解症（一種 statin 即可）；或肌肉／肝臟副作用需 Myalgia score >8 分，且確認對兩種 statin 不耐受、其一在最低有效劑量下均不耐受。禁忌症：藥物過敏、活動性肝病變（需佐證）。', 'F p.277 附表二-D 3.2(2)(3)'));
    items.push(item('A2D-MINDOSE', '每日最低有效劑量（仿單最低劑量）：rosuvastatin 5、atorvastatin 10、pravastatin 10、lovastatin 20、fluvastatin 20、pitavastatin 1、simvastatin 5 mg；另最低有效劑量可採每週累積之最低劑量計算結果。', 'F p.278 附表二-D 備註2'));
    return { status: ok ? 'eligible' : 'not_eligible', items };
  }
  const ok = st3 && eze3 && ldlOk;
  items.push(item(ids.I, `高強度 statin（如 rosuvastatin 20mg 或 atorvastatin 40 mg(含)以上）或可耐受最大劑量 statin ≧3 個月（目前 ${x.high_or_max_statin_months ?? '未填'}），之後再合併 ezetimibe 10 mg ≧3 個月（目前 ${x.eze_add_on_months ?? '未填'}），LDL-C 仍高於 100（目前 ${cur}）→ ${ok ? '符合' : '不符合'}。`, ids.ICite));
  return { status: ok ? 'eligible' : 'not_eligible', items };
}

function evalEvolocumab(x) {
  const mace = maceCheck(x, { evt: 'EVO-MACE-EVT', I: 'EVO-MACE-I', II: 'EVO-MACE-II', evtCite: 'F p.42 2.6.4.1 1.(2)', ICite: 'F p.42 2.6.4.1 1.(2)I', IICite: 'F p.42 2.6.4.1 1.(2)II', cite: 'F p.42 2.6.4.1 1.(2)' });
  const items = [item('EVO-PATH1', '路徑 1：發生重大心血管事件之病人', 'F p.42 2.6.4.1 1.'), ...mace.items];
  if (mace.status === 'eligible') {
    items.push(item('EVO-MACE-REV', '須經事前審查（附表二-D）；每次核准 12 個月；再次申請若 LDL-C 較開始前下降未達 30% 即不再給付。', 'F p.42 2.6.4.1 1.(1)'));
    items.push(item('EVO-MACE-DOSE', '最高劑量每兩週 1 支；不可同時使用其他 PCSK9 血脂調節劑。', 'F p.42 2.6.4.1 1.(3)(4)'));
    items.push(A2D_LDL);
  }
  // 路徑 2：HoFH
  const h = [];
  let hofh = 'not_eligible';
  const clinical = ['hofh_c1', 'hofh_c2', 'hofh_c3', 'hofh_c4'].filter((k) => x[k]).length;
  const hasHofhData = x.hofh_genetic || clinical > 0 || x.statin_eze_combo_months !== null || x.dx_hofh
    || x.hofh_gene_negative !== null || x.hofh_dx_confirmed !== null;
  if (hasHofhData) {
    h.push(item('EVO-PATH2', '路徑 2：同合子家族性高膽固醇血症之病人', 'F p.42 2.6.4.1 2.'));
    const combo6 = x.statin_eze_combo_months !== null && x.statin_eze_combo_months >= 6;
    const cur = x.ldl_current;
    const ldlOk = cur !== null && cur > 130;
    h.push(item('EVO-HOFH', `最高忍受劑量 statin＋ezetimibe 合併治療 6 個月（目前 ${x.statin_eze_combo_months ?? '未填'}），LDL-C 仍高於 130（目前 ${cur ?? '未填'}）→ ${combo6 && ldlOk ? '符合' : '不符合'}。`, 'F p.42 2.6.4.1 2.(1)'));
    const gen = !!x.hofh_genetic && !!x.dx_hofh;
    if (x.hofh_genetic) h.push(item('HOFH-I', `基因檢測同合子／多重基因異常，且確診為同合子家族性高膽固醇血症之患者，且台灣 FH 建議診斷標準評分 >8 分（評分標準本身未收錄於給付規定 [[MISSING_SOURCE]]）${x.dx_hofh ? '' : '；未勾選「診斷：HoFH」→ 不成立'}。`, 'F p.42 2.6.4.1 2.(1)I', { missingSource: true }));
    // 臨床路徑：「經遺傳基因檢測未檢出…之同合子家族性高膽固醇血症患者」兩前提皆「是」且徵狀 ≧3（S9 Codex r1）；
    // 徵狀 <3 或任一「否」→ 不成立；否則任一未答 → 無法判定
    const ans = { yes: '是', no: '否' };
    const pre = [x.hofh_gene_negative, x.hofh_dx_confirmed];
    const clin = clinical < 3 || pre.includes('no') ? false : pre.includes(null) ? null : true;
    h.push(item('HOFH-II', `「經遺傳基因檢測未檢出同合子基因變異或多重不同基因異常之同合子家族性高膽固醇血症患者，至少須符合以下三種臨床徵狀」：基因檢測未檢出同合子或多重基因異常（${ans[x.hofh_gene_negative] || '未答'}）、已確診同合子家族性高膽固醇血症（${ans[x.hofh_dx_confirmed] || '未答'}）；臨床徵狀需至少三項（目前 ${clinical} 項）：i.10歲前皮膚或肌腱黃色瘤；ii.未治療 LDL-C>500 且治療後>330；iii.父母有高膽固醇血症（未治療 TC>250）；iv.20歲前冠心病 → ${clin === null ? '前提未答，無法判定' : clin ? '成立' : '不成立'}。`, 'F p.42 2.6.4.1 2.(1)II'));
    const dxOk = gen || clin;
    if (cur === null) hofh = 'undetermined';
    else if (!(combo6 && ldlOk) || dxOk === false) hofh = 'not_eligible';
    else hofh = dxOk ? 'eligible' : 'undetermined';
    if (hofh === 'eligible') h.push(item('EVO-HOFH-REV', '須經事前審查，每次療程以 6 個月為限；每 6 個月評估 LDL-C，連續二次未較治療前降低 18% 以上則不予再用；每 4 週 1 次每次最多 3 支，或每 2 週 1 支。', 'F p.42 2.6.4.1 2.(2)–(4)'));
  }
  const rank = { eligible: 3, undetermined: 2, not_eligible: 1 };
  const status = rank[mace.status] >= rank[hofh] ? mace.status : hofh;
  return { status, items: [...items, ...h], preapproval: true };
}

function evalAlirocumab(x) {
  const mace = maceCheck(x, { evt: 'ALI-EVT', I: 'ALI-1', II: 'ALI-2', evtCite: 'F p.42 2.6.4.2 2.', ICite: 'F p.42 2.6.4.2 2.(1)', IICite: 'F p.43 2.6.4.2 2.(2)', cite: 'F p.42 2.6.4.2 2.' });
  const items = [item('ALI-SCOPE', '限使用於發生重大心血管事件之病人（alirocumab 無同合子家族性高膽固醇血症路徑）。', 'F p.42 2.6.4.2'), ...mace.items];
  if (mace.status === 'eligible') {
    items.push(item('ALI-REV', '須經事前審查（附表二-D）；每次核准 12 個月；LDL-C 下降未達 30% 不再給付；最高每兩週 1 支；不可同時使用其他 PCSK9。', 'F p.42–43 2.6.4.2 1.、3.'));
    items.push(A2D_LDL);
  }
  return { status: mace.status, items, preapproval: true };
}

// ── 降三酸甘油酯藥物給付規定表（F p.41）──
function evalTG(x) {
  if (x.tg === null) return null;
  const cite = 'F p.41 降三酸甘油酯藥物給付規定表';
  const cvd = DECISIONS.Q15_tgCvdUsesTable2Def ? !!x.t2_cvd : false;
  const ratio = x.tc !== null && x.hdl !== null && x.hdl > 0 ? x.tc / x.hdl : null;
  const lipidCond = () => {
    if (x.hdl !== null && x.hdl < 40) return true;
    if (ratio !== null) return ratio > 5;
    return null;
  };
  const rows = [];
  const mk = (id, label, lifestyle, startText, target, met, rowCite) => {
    rows.push({ id, label, lifestyleFirst: lifestyle, startText, target, status: met === null ? 'undetermined' : met ? 'eligible' : 'not_yet', cite: rowCite,
      nonPharm: lifestyle ? '給藥前應有3-6個月非藥物治療' : '與藥物治療可並行' });
  };
  const c2 = x.tg >= 200 ? lipidCond() : false;
  if (cvd || x.dm) {
    mk('TG-1', '心血管疾病或糖尿病病人', false, 'TG≧200mg/dL 且 (TC/HDL-C>5 或 HDL-C<40mg/dL)', 'TG<200mg/dL', c2, `${cite}／第1列`);
  } else {
    mk('TG-2', '無心血管疾病病人', true, 'TG≧200mg/dL 且 (TC/HDL-C>5 或 HDL-C<40mg/dL)', 'TG<200mg/dL', c2, `${cite}／第2列`);
    mk('TG-3', '無心血管疾病病人', false, 'TG≧500mg/dL', 'TG<500mg/dL', x.tg >= 500, `${cite}／第3列`);
  }
  const notes = [];
  if (DECISIONS.Q15_tgCvdUsesTable2Def) notes.push(item('Q15', '「心血管疾病」採表二心血管疾病定義（Q15）。', 'F p.40 心血管疾病定義'));
  return {
    tg: x.tg, ratio: ratio === null ? null : Math.round(ratio * 100) / 100, rows, notes,
    followUp: [item('TG-RX', '第一年應每3-6個月抽血檢查一次，第二年以後應至少每6-12個月抽血檢查一次，同時請注意副作用之產生如肝功能異常，橫紋肌溶解症。', `${cite}／處方規定欄（跨全部列）`)],
  };
}

// ── 主函式 ──
export function evaluate(raw = {}) {
  const x = normalize(raw);
  const useT1 = x.table_choice !== 'yes' || !DECISIONS.D2_table2;
  const useT2 = DECISIONS.D2_table2 && (x.table_choice === 'yes' || (x.table_choice === 'unsure' && DECISIONS.Q3_unsureShowsBoth));

  const table1 = useT1 ? evalTable1(x) : null;
  const table2 = useT2 ? evalTable2(x) : null;

  const scope = [];
  if (x.table_choice === 'yes') scope.push(item('SCOPE-02', '使用 2.6.1 總則所列表二品項：不適用表一，僅適用表二。', 'F p.33 2.6.1 總則'));
  else if (x.table_choice === 'unsure') scope.push(item('SCOPE-01/02', '品項不確定：表一、表二結果並列；適用哪張表取決於處方品項（Q3）。', 'F p.33 2.6.1 總則'));
  else scope.push(item('SCOPE-01', '降膽固醇藥物（非表二清單品項）適用表一。', 'F p.33 2.6.1 總則'));

  // ezetimibe／複方的「治療目標」與起始條件來源（Q10、Q12）：表二品項用表二，否則用表一
  const src = table1 || table2;
  const isT1 = !!table1;
  const ctx = {
    tierIsT1: isT1,
    tableName: isT1 ? '表一' : '表二',
    tableCite: isT1 ? 'F p.37 表一' : 'F p.40 表二',
    elig: src.eligibility.status,
    ldlMet: src.targets.ldl.met,
    cur: x.ldl_current,
    target: src.targets.ldl.value,
    targetCite: src.targets.ldl.cite,
  };

  const drugs = [];
  if (table1) {
    const e = table1.eligibility;
    drugs.push({ id: 'statin', name: 'Statin', status: e.status === 'eligible' && e.lifestyleFirst ? 'eligible_lifestyle_first' : e.status, items: table1.statinItems });
  } else {
    drugs.push({ id: 'statin', name: 'Statin（表二品項）', status: table2.eligibility.status,
      items: [RX_INTENSITY] });
  }
  drugs.push({ id: 'ezetimibe', name: 'Ezetimibe（2.6.2）', ...evalEzetimibe(x, ctx) });
  drugs.push({ id: 'combo', name: '含 ezetimibe 及 statin 之複方（2.6.3）', ...evalCombo(x, ctx) });
  if (DECISIONS.D1_pcsk9) {
    drugs.push({ id: 'evolocumab', name: 'Evolocumab（如 Repatha）（2.6.4.1）', ...evalEvolocumab(x) });
    drugs.push({ id: 'alirocumab', name: 'Alirocumab（如 Praluent）（2.6.4.2）', ...evalAlirocumab(x) });
  }
  drugs.push({ id: 'inclisiran', name: 'Inclisiran（siRNA）', status: 'no_article',
    items: [item('NOART-1', '給付規定無專條，是否收載請查健保用藥品項。表一處方規定僅列「siRNA」為可考慮的 non-statin 類別。', 'F p.37 表一處方規定；全文無 inclisiran 專條')] });
  drugs.push({ id: 'bempedoic', name: 'Bempedoic acid（ATP citrate lyase 抑制劑）', status: 'no_article',
    items: [item('NOART-2', '給付規定無專條，是否收載請查健保用藥品項。表一處方規定僅列「ATP citrate lyase 抑制劑」為可考慮的 non-statin 類別。', 'F p.37 表一處方規定；全文無 bempedoic acid 專條')] });

  return {
    meta: META,
    input: x,
    scope,
    table1,
    table2,
    drugs,
    tg: DECISIONS.D5_tgTable ? evalTG(x) : null,
  };
}
