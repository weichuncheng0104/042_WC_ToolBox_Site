// 共用 header（返回主頁）與 footer（免責聲明、法規版本、官方連結）。
// root：從目前頁面到網站根目錄的相對前綴（目錄頁 './'，工具頁 '../../'）。
export const DISCLAIMER =
  '本工具為臨床輔助，非處方依據；一切以健保署公告為準。輸入資料只在瀏覽器內計算，不會送出或儲存。';

export function renderHeader(root, { showHome = true } = {}) {
  const el = document.createElement('header');
  el.className = 'site-header';
  if (showHome) {
    const a = document.createElement('a');
    a.href = root + 'index.html';
    a.textContent = '← 返回主頁';
    el.append(a);
  }
  const t = document.createElement('span');
  t.className = 'title';
  t.textContent = '看診工具箱';
  el.append(t);
  document.body.prepend(el);
}

export function renderFooter({ regulation, officialUrl } = {}) {
  const el = document.createElement('footer');
  el.className = 'site-footer';
  const p = (text) => {
    const x = document.createElement('p');
    x.textContent = text;
    return x;
  };
  el.append(p('免責聲明：' + DISCLAIMER));
  if (regulation) el.append(p('法規版本：' + regulation));
  if (officialUrl) {
    const x = document.createElement('p');
    x.append('官方公告：');
    const a = document.createElement('a');
    a.href = officialUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = officialUrl;
    x.append(a);
    el.append(x);
  }
  document.body.append(el);
}
