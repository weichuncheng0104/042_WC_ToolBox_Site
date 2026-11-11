// 「看條文」頁的區塊（純資料，不碰 DOM）：ref_page.js 依序渲染，測試以同一份檢查逐字（雙向）與順序。
import { TABLE1, TABLE2 } from './rule_tables.js';
import { DRUG_CODES } from './drug_codes.js';
import { ARTICLES, T1_ADVICE, TG_TABLE, TABLE_SRC, NONHDL_PREFIX } from './articles.js';

// 表一／表二換原文標題與欄名、去本工具註；non-HDL-C 段抽出，依原文順序接在評估建議之後
const noNonHdl = (T) => ({ ...T, sections: T.sections.map((x) => ({ ...x, paras: x.paras.filter((p) => !p.startsWith(NONHDL_PREFIX)) })) });
const NONHDL = TABLE1.sections.flatMap((x) => x.paras).filter((p) => p.startsWith(NONHDL_PREFIX));
const TABLES = {
  TABLE1: noNonHdl({ ...TABLE1, ...TABLE_SRC.TABLE1, note: '' }),
  TABLE2: { ...TABLE2, ...TABLE_SRC.TABLE2, note: '' },
  TG_TABLE,
  T1_ADVICE: { ...T1_ADVICE, paras: [...T1_ADVICE.paras, ...NONHDL] },
};

// kind：article＝條文（含品項代碼表）；table＝規定表（ruleSection）；text＝純段落
export function articleBlocks() {
  const out = [];
  for (const a of ARTICLES) {
    out.push({ kind: 'article', key: a.id, a, codes: a.list ? DRUG_CODES.filter((d) => d.category === a.list) : [] });
    for (const k of a.tables || []) out.push({ kind: k === 'T1_ADVICE' ? 'text' : 'table', key: k, T: TABLES[k] });
  }
  return out;
}

// 區塊中顯示的原文字串（標題、段落、表格欄名與儲存格、代碼／藥名／成分組名）；工具自寫的小標、出處、提示不列
export function blockTexts(b) {
  if (b.kind === 'article') {
    return [b.a.heading, ...(b.a.paras || []), ...(b.a.after || []), ...b.codes.flatMap((d) => [d.code, d.name, d.group || ''])].filter(Boolean);
  }
  if (b.kind === 'text') return [b.T.heading, ...b.T.paras];
  const T = b.T;
  return [T.title, ...T.columns.filter(Boolean), ...T.rows.flatMap((r) => [r.risk, r.nonPharm, r.start, r.target]), ...T.sections.flatMap((x) => x.paras)];
}
