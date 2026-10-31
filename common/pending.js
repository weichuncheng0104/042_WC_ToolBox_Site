// 待生效提示：資料來自 tools.js 工具的 pending（status 非 'deployed' 才顯示）。日期為本機日期 YYYY-MM-DD，可注入以便測試。
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function pendingNotices(tool, today) {
  return (tool.pending || []).filter((p) => p.status !== 'deployed').map((p) => ({
    url: p.url,
    text: today < p.effective
      ? `健保已公告修訂給付規定（${p.docNo}），自 ${p.effective} 生效。本工具目前仍依 ${p.replaces} 版判定。`
      : `健保公告修訂已於 ${p.effective} 生效，本工具更新中，判定請以健保署公告為準。`,
  }));
}

// 插在 <main> 最上方；無提示則不插入。
export function renderPendingNotice(tool, today = localDate()) {
  const list = pendingNotices(tool, today);
  if (!list.length) return;
  const box = document.createElement('div');
  box.className = 'notice pending';
  for (const n of list) {
    const p = document.createElement('p');
    const a = document.createElement('a');
    a.href = n.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = '公告連結';
    p.append(n.text, '（', a, '）');
    box.append(p);
  }
  document.querySelector('main').prepend(box);
}
