// 藥品代碼查詢（純函式）：只涵蓋給付規定 2.6 列舉清單與公告附件1 品項。資料見 drug_codes.js。
import { DRUG_CODES } from './drug_codes.js';

export const CODE_RE = /^[A-Z][A-Z0-9]{9}$/;

// 類別說明與表單帶入值（field＝表單欄位，value＝帶入選項）
export const CATEGORY_INFO = {
  t2: { label: '2.6.1 總則所列品項：不適用表一，僅適用表二', field: 'table_choice', value: 'yes' },
  eze3m: { label: '2.6.2 清單品項：需經 statin 單一治療 3 個月未達治療目標，始得併用', field: 'eze_listed', value: 'yes' },
  cmb3m: { label: '2.6.3 清單品項：需經 statin 單一治療 3 個月未達治療目標，始得使用', field: 'cmb_listed', value: 'yes' },
};
// 公告附件1（115/9/1 擴增給付範圍）品項：依其「適用通則及 2.6.x 規定」，且不在 2.6 列舉清單內
export const ANN1_INFO = {
  '2.6.1': { label: '公告附件1 擴增給付範圍品項，適用 2.6.1：不在總則所列清單內，適用表一', field: 'table_choice', value: 'no' },
  '2.6.2': { label: '公告附件1 擴增給付範圍品項，適用 2.6.2：不在 2.6.2 清單內，為一般品項（statin 單一治療 6–8 週路徑）', field: 'eze_listed', value: 'no' },
  '2.6.3': { label: '公告附件1 擴增給付範圍品項，適用 2.6.3：不在 2.6.3 清單內，為一般品項（statin 單一治療 6–8 週路徑）', field: 'cmb_listed', value: 'no' },
};

export const NOT_FOUND_TEXT = '不在給付規定 2.6 列舉清單內：statin 類適用表一；ezetimibe／複方為一般品項（6–8 週路徑）。';
export const COVERAGE_NOTE = '本查詢只涵蓋給付規定 2.6 列舉的品項，是否為健保收載品項請查健保署藥品查詢。';

export const infoOf = (d) => (d.category === 'ann1' ? ANN1_INFO[d.rule] : CATEGORY_INFO[d.category]);

// 比對時忽略大小寫、空白與引號（原文 PDF 文字層的空白、引號不一致）
const norm = (s) => s.toUpperCase().replace(/[\s"'“”〝〞]/g, '');

// 代碼（10 碼）→ 完整比對；其他（或 10 碼但無此代碼，如「ROSUVASTAT」）→ 藥名或成分部分比對
export function lookupDrug(query) {
  const q = norm(query || '');
  if (!q) return [];
  if (CODE_RE.test(q)) {
    const hit = DRUG_CODES.filter((d) => d.code === q);
    if (hit.length) return hit;
  }
  return DRUG_CODES.filter((d) => norm(d.name).includes(q) || norm(d.group || '').includes(q));
}
