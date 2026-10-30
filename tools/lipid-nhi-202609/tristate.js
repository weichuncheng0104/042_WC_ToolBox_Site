// 三態題（是／否／未答）的「清除」鈕，與第 7 區「診斷：HoFH」→ 第 8 區「已確診」帶入。只動畫面選項，不改引擎判定。
export const TRISTATE = ['max_statin_within_1y', 'hofh_gene_negative', 'hofh_dx_confirmed'];

export function clearRadios(root, name) {
  for (const r of root.querySelectorAll(`input[name="${name}"]`)) r.checked = false;
}

// 第 7 區 dx_hofh 勾選變動時呼叫；auto＝「已確診」目前的值是自動帶入且未被手動改過。回傳新的 auto。
// 勾選且未答 → 帶入「是」；取消勾選且仍為自動帶入的「是」→ 回到未答；手動答案一律不覆蓋。
export function linkHofh(root, checked, auto) {
  const yes = root.querySelector('input[name="hofh_dx_confirmed"][value="yes"]');
  const answered = [...root.querySelectorAll('input[name="hofh_dx_confirmed"]')].some((r) => r.checked);
  if (checked && !answered) {
    yes.checked = true;
    return true;
  }
  if (!checked && auto && yes.checked) clearRadios(root, 'hofh_dx_confirmed');
  return checked ? auto : false;
}
