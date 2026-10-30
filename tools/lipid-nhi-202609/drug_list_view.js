// 完整藥物清單頁的純函式（不碰 DOM，供測試）：來源行、標記文字、依學名分組、篩選。
export const MARK_LABEL = {
  t2: '2.6.1 列舉：不適用表一、僅適用表二',
  eze3m: '2.6.2 列舉：需 statin 單一治療 3 個月未達目標',
  cmb3m: '2.6.3 列舉：需 statin 單一治療 3 個月未達目標',
  pcsk9: '2.6.4 PCSK9',
  ann1: '公告附件1 擴增給付範圍品項',
  noChapter: '用藥品項檔「給付規定章節」欄空白：依給付規定／公告列舉納入',
};

export const sourceLine = (s) => `健保署健保用藥品項（${s.fileDate} 版）＋給付規定 ${s.regulation} 版`;

// B1（user 2026-10-31 裁定 (a)）：支付價 0 之代碼不列入；n 由 script 計算（DRUG_LIST.zeroPriceExcluded）
export const zeroPriceNote = (n) => `支付價為 0 之代碼（多為已由新代碼取代之舊代碼）未列入，共 ${n} 筆。`;

// 頁面分區：表一、表二固定顯示；無法分類只在有資料時顯示（B2）
export function sections(list) {
  const out = [
    { id: 'table1', title: '表一適用品項', items: list.items.filter((d) => d.table === 1) },
    { id: 'table2', title: '表二適用品項（2.6.1 總則列舉：不適用表一，僅適用表二）', items: list.items.filter((d) => d.table === 2) },
  ];
  if (list.unclassified.length) {
    out.push({ id: 'unclassified', title: '無法分類：含 statin 成分，但用藥品項檔未標給付規定章節、也不在給付規定 2.6 列舉清單', items: list.unclassified,
      note: '本工具無法判定表別，請查健保署原文（給付規定 2.6.1 與藥品給付規定章節）。' });
  }
  return out;
}

// 依學名分組（學名字母序），組內維持資料檔順序（英文商品名序）
export function grouped(items) {
  const m = new Map();
  for (const d of items) {
    if (!m.has(d.generic)) m.set(d.generic, []);
    m.get(d.generic).push(d);
  }
  return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([generic, xs]) => ({ generic, items: xs }));
}

// 代碼／學名／成分／英中文商品名部分比對，忽略大小寫與空白；空字串＝全部
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');
export function matches(d, q) {
  const k = norm(q);
  return !k || [d.code, d.generic, d.ingredient, d.en, d.zh].some((v) => norm(v).includes(k));
}
