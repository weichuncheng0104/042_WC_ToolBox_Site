// 工具登錄表：每個工具一列，依此順序顯示於目錄頁。
// 站內工具：path 為相對 website/ 的資料夾（用相對路徑，Pages 有子路徑前綴）。
// 外部工具（type: 'external'）：只登錄 url（https 絕對網址、不帶參數），程式在各自 project；另開分頁。
// no：卡片編號（首頁以數字徽章顯示）。固定不變，不隨排序或增刪改變；新工具取下一個號碼，編號永不重用。
// lastUpdate：站內工具最後一次上線更新日（YYYY-MM-DD，本機日期）；首頁卡片與工具各頁 footer 顯示「last_update：…」。
//   每次更新上線前改成當天；sync_site.js 會擋「工具檔案有變更但 lastUpdate 不是當天」（docs/update_runbook.md）。
// pending：已公告、尚未生效（或已生效但新版尚未上線）的法規修訂，每筆一個物件（待生效提示與 script/preflight.js 的單一來源）：
//   docNo 公告字號、issued 發文日、effective 生效日（YYYY-MM-DD）、url 公告網址、replaces 新版上線前工具所依版本、
//   summary 影響範圍摘要、branch 預備新版的分支、status：'prepared'（新版在分支備妥、未上線）／'deployed'（已合併上線）。
//   status 非 deployed → 工具頁、drugs.html、drug_list.html 頂端顯示提示（common/pending.js）；生效當天合併分支時改 deployed。
export const OFFICIAL_URL = 'https://www.nhi.gov.tw/ch/cp-20300-7968a-3258-1.html';

export const TOOLS = [
  {
    no: 1,
    id: 'lipid-nhi-202609',
    name: '健保降血脂藥物評估工具',
    description: '依健保藥品給付規定 2.6.1–2.6.4，評估降血脂藥物給付與 LDL-C 治療目標。',
    path: 'tools/lipid-nhi-202609/',
    regulation: '健保藥品給付規定 2.6.1–2.6.4，115/9/1 生效（依 115/10/22 版完整給付規定）',
    officialUrl: OFFICIAL_URL,
    status: '上線', // 首頁不渲染狀態標籤
    lastUpdate: '2026-11-02',
    pages: ['drugs.html', 'drug_list.html'], // 工具資料夾內的其他頁（查可用藥物、完整藥物清單）
    pending: [
      {
        docNo: '健保審字第1150672925號',
        issued: '2026-10-29',
        effective: '2026-12-01',
        url: 'https://www.nhi.gov.tw/ch/cp-20681-3808b-3258-1.html',
        replaces: '115/9/1',
        summary: '2.6.1 表二清單刪 3 項（改適用表一）、2.6.3 三個月清單刪 3 項（回到 6–8 週）、上述 6 項降價',
        branch: 'pending/20261201-nhi-1150672925',
        status: 'prepared',
      },
    ],
  },
  {
    no: 2,
    id: 'hbv-treatment-024',
    type: 'external',
    name: 'HBV 治療資格輔助評估',
    description: '慢性 B 型肝炎治療資格輔助評估：健保給付合規與國際指引建議雙軸判定',
    url: 'https://024-hbv-treatment.vercel.app/login',
    requiresLogin: true,
  },
  {
    no: 3,
    id: 'nhi-card-032',
    type: 'external',
    name: '健保卡資訊解析',
    description: '健保醫療資訊雲端查詢系統擷取檔的解析與原文對照複核工具',
    url: 'https://032-nhi-card-info-agent.vercel.app/login',
    requiresLogin: true,
  },
];
