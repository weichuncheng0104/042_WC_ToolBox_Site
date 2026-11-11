// 健保雲端 .json 帶入（S22）：ICD-10／ATC 對照與處置名稱關鍵字。每組附理由；說明見 spec/lipid-nhi-202609/nhi_import.md。
// 碼一律去小數點後以「前綴」比對（例 I25.10 → I2510 符合前綴 I25）。只產生「推算建議」，需醫師確認。
// 本檔不含任何藥品品項的表一／表二或 2.6.2／2.6.3 歸屬；品項歸屬一律查 drug_codes.js（DRUG_CODES）。

export const ICD_GROUPS = [
  { id: 'cad', prefixes: ['I20', 'I21', 'I22', 'I23', 'I24', 'I25'], label: '缺血性心臟病',
    reason: 'ICD-10-CM I20–I25 Ischemic heart diseases；條文「冠狀動脈疾病」未定義範圍（F p.38 一(一)；Q4）' },
  { id: 'acs', prefixes: ['I200', 'I21', 'I22', 'I24'], label: '急性冠心症',
    reason: 'ICD-10-CM I20.0 unstable angina、I21 acute MI、I22 subsequent MI、I24 other acute ischemic heart disease（F p.38 二(一)1「急性冠心症病史」）' },
  { id: 'mi', prefixes: ['I21', 'I22'], label: '心肌梗塞',
    reason: 'ICD-10-CM I21／I22 心肌梗塞（發病 4 週內編碼；F p.38 一(一)1「一年內曾經歷心肌梗塞」；附表二-D 3.1 心肌梗塞）' },
  { id: 'stroke_tia', prefixes: ['I63', 'I693', 'G45', 'Z8673'], exclude: ['G454'], label: '缺血性中風／TIA',
    reason: 'ICD-10-CM I63 cerebral infarction、I69.3 sequelae of cerebral infarction、G45 TIA（排除 G45.4 transient global amnesia）、Z86.73 personal history of TIA and cerebral infarction without residual deficits（F p.38 二(一)3）' },
  { id: 'pad', prefixes: ['I702', 'I703', 'I704', 'I705', 'I706', 'I707', 'I7092', 'I739'], label: '周邊動脈疾病',
    reason: 'ICD-10-CM I70.2 atherosclerosis of native arteries of extremities、I70.3–I70.7 atherosclerosis of bypass graft(s) of the extremities、I70.92 chronic total occlusion of artery of the extremities、I73.9 peripheral vascular disease, unspecified（F p.38 一(二)）' },
  { id: 'pad_ischemia', prefixes: ['I7021', 'I7022', 'I7023', 'I7024', 'I7025', 'I7026'], label: '四肢原生動脈粥狀硬化合併肢體缺血症狀',
    reason: 'ICD-10-CM I70.21 intermittent claudication、I70.22 rest pain、I70.23–I70.25 ulceration、I70.26 gangrene（atherosclerosis of native arteries of extremities）：碼本身即描述肢體缺血症狀（F p.38 二(一)4「有肢體缺血相關症狀」；I70.20 unspecified、I70.29 other 不採）' },
  { id: 'pad_graft', prefixes: ['I703', 'I704', 'I705', 'I706', 'I707'], label: '四肢繞道移植血管動脈粥狀硬化',
    reason: 'ICD-10-CM I70.3–I70.7 atherosclerosis of bypass graft(s) of the extremities：代表曾接受四肢繞道手術（F p.38 二(一)4「曾接受血管再通術」；低信心；缺血症狀見 pad_ischemia，截肢不推算）' },
  { id: 'dm', prefixes: ['E08', 'E09', 'E10', 'E11', 'E12', 'E13'], label: '糖尿病',
    reason: 'ICD-10 E08–E13 diabetes mellitus（F p.38–39 三(一)）' },
  { id: 'htn', prefixes: ['I10', 'I11', 'I12', 'I13', 'I15', 'I16'], label: '高血壓',
    reason: 'ICD-10-CM I10–I16 hypertensive diseases（含 I16 hypertensive crisis；F p.39 心血管風險因子 一；Q9 由醫師勾選，此處只建議）' },
  { id: 'ckd', prefixes: ['N18'], exclude: ['N186'], label: '慢性腎臟病',
    reason: 'ICD-10-CM N18 chronic kidney disease（排除 N18.6 ESRD）；條文另要求 UACR≧30 或 eGFR<60 持續 3 個月（F p.39 三(二)）' },
  { id: 'dialysis', prefixes: ['N186', 'Z992', 'Z493'], label: '透析',
    reason: 'ICD-10-CM N18.6 end stage renal disease、Z99.2 dependence on renal dialysis、Z49.3 encounter for adequacy testing for dialysis（Z49.0 透析前準備不代表已透析，不採）（F p.39 三(二)「進入透析治療前」；Q17）' },
  { id: 'revasc', prefixes: ['Z951', 'Z955', 'Z9861'], label: '冠狀動脈再通術後狀態',
    reason: 'ICD-10-CM Z95.1 aortocoronary bypass graft、Z95.5 coronary angioplasty implant and graft、Z98.61 coronary angioplasty status（F p.38 二(一)2）' },
  { id: 'primary_hc', prefixes: ['E780'], label: '純高膽固醇血症',
    reason: 'ICD-10-CM E78.0 pure hypercholesterolemia（含 E78.01 familial）；E78.5 等未分類高血脂不採（F p.41 2.6.2／2.6.3「原發性高膽固醇血症」）' },
];

// 用藥 ATC（前綴）。「使用中」＝處方日期＋給藥日數涵蓋擷取日前 90 天內（activeDays 另訂者從之；見 spec）。
export const ATC_GROUPS = [
  { field: 'on_dm_drug', prefixes: ['A10'], reason: 'ATC A10 drugs used in diabetes（F p.39 六(三)）' },
  { field: 'on_antihtn', prefixes: ['C02', 'C03', 'C07', 'C08', 'C09'], reason: 'ATC C02 antihypertensives、C03 diuretics、C07 beta blockers、C08 CCB、C09 RAS agents（C03／C07 亦用於心衰竭等，僅建議；F p.39 六(二)）' },
  { field: 'on_tg_drug', prefixes: ['C10AB', 'C10AD', 'C10AX06'], reason: 'ATC C10AB fibrates、C10AD nicotinic acid、C10AX06 omega-3 triglycerides（F p.39 六(四)）' },
  { field: 'on_gemfibrozil', prefixes: ['C10AB04'], activeDays: 30, reason: 'ATC C10AB04 gemfibrozil；勾選會使 2.6.3 判「不得併用」，故只認處方涵蓋到擷取日前 30 天內（F p.41 2.6.3 第3款）' },
];

// 降血脂藥（決定「第一張降血脂藥處方」與目前用藥）：ATC C10 lipid modifying agents
export const LIPID_ATC = 'C10';
export const STATIN_ATC = 'C10AA';

// 處置／特材名稱關鍵字（低信心）：冠狀動脈支架特材、或處置名稱明示冠狀動脈介入／繞道
export const REVASC_TEXT = {
  material: [/冠狀|coronary/i, /支架|stent/i], // 兩者皆須出現
  // 需冠狀動脈限定詞（PTCA 本身即 percutaneous transluminal coronary angioplasty）；單獨 angioplasty（透析通路、周邊血管）不算
  procedure: /PTCA|\bPCI\b|冠狀動脈.{0,12}(擴張|成形|支架|繞道)|coronary.{0,30}(angioplasty|stent|bypass)|CABG/i,
};
