// statin 強度參考表（教科書參考，非健保定義）：只供 UI 顯示，engine.js 不得引用、不用於任何判定。
// 出處：Source_Info/lipid-nhi-202609/reference/statin_intensity_019.md（Washington Manual 2022 Table 3-10 p.84）。
export const STATIN_INTENSITY = {
  title: 'statin 強度參考（非健保定義）',
  cite: 'Washington Manual 2022 Table 3-10 p.84（The Washington Manual of Medical Therapeutics；轉引 2018 ACC/AHA 指引）',
  note: '教科書參考，不是給付條件；本工具不以此表做任何判定。給付規定 2.6.4 舉例的高強度 statin（rosuvastatin 20 mg、atorvastatin 40 mg 以上）與此表一致。',
  rows: [
    { level: '高', ldlDrop: 'LDL-C ↓≧50%', drugs: ['Atorvastatin 40–80 mg', 'Rosuvastatin 20–40 mg'] },
    { level: '中', ldlDrop: 'LDL-C ↓30–49%', drugs: ['Atorvastatin 10–20 mg', 'Rosuvastatin 5–10 mg', 'Simvastatin 20–40 mg', 'Pravastatin 40–80 mg', 'Lovastatin 40 mg', 'Fluvastatin 40 mg bid 或 80 mg XL', 'Pitavastatin 1–4 mg'] },
    { level: '低', ldlDrop: 'LDL-C ↓<30%', drugs: ['Simvastatin 10 mg', 'Pravastatin 10–20 mg', 'Lovastatin 20 mg', 'Fluvastatin 20–40 mg'] },
  ],
};
