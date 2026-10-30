// 共用 header（返回主頁）與 footer（免責聲明、法規版本、官方連結、版權宣告與聯絡）。
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

export function renderFooter({ regulation, officialUrl, lastUpdate } = {}) {
  const el = document.createElement('footer');
  el.className = 'site-footer';
  const p = (text) => {
    const x = document.createElement('p');
    x.textContent = text;
    return x;
  };
  el.append(p('免責聲明：' + DISCLAIMER));
  if (regulation) el.append(p('法規版本：' + regulation));
  if (lastUpdate) el.append(p('last_update：' + lastUpdate));
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
  el.append(renderCopyright());
  document.body.append(el);
}

// 版權宣告＋聯絡（比照 020 公開站 footer）。email 以 JS 組字，原始碼不出現完整字串。
export const COPYRIGHT = '© 2026 胃腸肝膽科-鄭維鈞醫師';
export const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hant';

function renderCopyright() {
  const box = document.createElement('div');
  box.className = 'copyright';
  const cr = document.createElement('p');
  cr.className = 'cr';
  cr.textContent = COPYRIGHT;
  const lic = document.createElement('p');
  lic.append('本站原創之程式、判定邏輯整理與編排採 ');
  const a = document.createElement('a');
  a.href = LICENSE_URL;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'CC BY-NC 4.0';
  lic.append(a, '（姓名標示—非商業）。');
  const law = document.createElement('p');
  law.textContent =
    '健保署藥品給付規定條文依著作權法第 9 條第 1 項第 1 款（憲法、法律、命令或公文）不得為著作權之標的；' +
    'Washington Manual 等教科書引註之版權歸原權利人。';
  const cite = document.createElement('p');
  cite.textContent = '建議引用：鄭維鈞，《看診工具箱》，2026，CC BY-NC 4.0。';
  const contact = document.createElement('p');
  contact.id = 'contact';
  const u = 'wccheng.work2026', d = 'gmail.com';
  const m = document.createElement('a');
  m.href = 'mailto:' + u + '@' + d;
  m.textContent = u + '@' + d;
  contact.append('指正／討論歡迎來信：', m);
  box.append(cr, lic, law, cite, contact);
  return box;
}
