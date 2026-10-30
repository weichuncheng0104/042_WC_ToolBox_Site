// 工具登錄表：每個工具一列。path 為相對 website/ 的資料夾（用相對路徑，Pages 有子路徑前綴）。
export const OFFICIAL_URL = 'https://www.nhi.gov.tw/ch/cp-20300-7968a-3258-1.html';

export const TOOLS = [
  {
    id: 'lipid-nhi-202609',
    name: '健保降血脂藥物評估工具',
    description: '依健保藥品給付規定 2.6.1–2.6.3，評估降血脂藥物給付與 LDL-C 治療目標。',
    path: 'tools/lipid-nhi-202609/',
    regulation: '健保藥品給付規定 2.6.1–2.6.3，115/9/1 生效',
    officialUrl: OFFICIAL_URL,
    status: '開發中',
  },
];
