// 表單狀態（S11）：讀表單、「清空重評」逐欄回到 HTML 初始值、依欄位值重算停用狀態。只動畫面，不改引擎判定。

export function readFields(form) {
  const x = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') x[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) x[el.name] = el.value; }
    else x[el.name] = el.value === '' ? null : el.value;
  }
  return x;
}

// 欄位值的顯示文字：radio 取選項文字、select 取選項文字、勾選框顯示「勾選」（帶入預覽與判讀所用資料共用）
export function displayValue(form, field, value) {
  if (value === true) return '勾選';
  if (value === false || value === null || value === undefined || value === '') return '（未填）';
  const r = form.querySelector(`input[type="radio"][name="${field}"][value="${value}"]`);
  if (r) return r.parentElement.textContent.trim();
  const s = form.querySelector(`select[name="${field}"]`);
  if (s) { const o = [...s.options].find((op) => op.value === value); if (o) return o.textContent.trim(); }
  return String(value);
}

// 表單內每個 input／select／textarea 回到 HTML 預設值（不依賴 form.reset()：表單內 id="reset" 的按鈕會蓋掉該方法）。
// 停用狀態不在此處理：一律由 syncMeno／syncDisabled 依欄位值重算（refresh()）
export function resetFields(root) {
  for (const el of root.querySelectorAll('input, select, textarea')) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = el.defaultChecked;
      el.indeterminate = false;
    } else if (el.options) {
      for (const o of el.options) o.selected = o.defaultSelected;
    } else {
      el.value = el.defaultValue;
    }
  }
}

// 「已停經」僅女性適用：男性 → 停用並取消勾選；女或未選 → 可勾
export function syncMeno(root, sex) {
  const box = root.querySelector('input[name="postmenopausal"]');
  box.disabled = sex === 'M';
  if (sex === 'M') box.checked = false;
}

// 依欄位值重算停用：Q14 路徑 II（statin 禁忌症／不耐受 → 此題與其清除鈕停用，引擎同樣忽略）；
// 較高層級鎖定的區塊只停用表一專用欄位（表二／降 TG／ezetimibe 仍會用到的欄位保持可填）。回傳是否為路徑 II
export function syncDisabled(root, x, locked) {
  const pathII = !!(x.statin_intolerant || x.statin_contraindicated);
  for (const r of root.querySelectorAll('input[name="max_statin_within_1y"], button[data-clear="max_statin_within_1y"]')) r.disabled = pathII;
  for (const el of root.querySelectorAll('[data-t1only]')) el.disabled = locked.includes(el.closest('fieldset[data-sec]').dataset.sec);
  return pathII;
}
