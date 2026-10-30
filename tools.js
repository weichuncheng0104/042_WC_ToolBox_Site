// 工具登錄表：每個工具一列，依此順序顯示於目錄頁。
// 站內工具：path 為相對 website/ 的資料夾（用相對路徑，Pages 有子路徑前綴）。
// 外部工具（type: 'external'）：只登錄 url（https 絕對網址、不帶參數），程式在各自 project；另開分頁。
export const OFFICIAL_URL = 'https://www.nhi.gov.tw/ch/cp-20300-7968a-3258-1.html';

export const TOOLS = [
  {
    id: 'lipid-nhi-202609',
    name: '健保降血脂藥物評估工具',
    description: '依健保藥品給付規定 2.6.1–2.6.4，評估降血脂藥物給付與 LDL-C 治療目標。',
    path: 'tools/lipid-nhi-202609/',
    regulation: '健保藥品給付規定 2.6.1–2.6.4，115/9/1 生效（依 115/10/22 版完整給付規定）',
    officialUrl: OFFICIAL_URL,
    status: '可用',
    pages: ['drugs.html'], // 工具資料夾內的其他頁（查可用藥物）
  },
  {
    id: 'hbv-treatment-024',
    type: 'external',
    name: 'HBV 治療資格輔助評估',
    description: '慢性 B 型肝炎治療資格輔助評估：健保給付合規與國際指引建議雙軸判定',
    url: 'https://024-hbv-treatment.vercel.app/login',
    requiresLogin: true,
  },
  {
    id: 'nhi-card-032',
    type: 'external',
    name: '健保卡資訊解析',
    description: '健保醫療資訊雲端查詢系統擷取檔的解析與原文對照複核工具',
    url: 'https://032-nhi-card-info-agent.vercel.app/login',
    requiresLogin: true,
  },
];
