// 目錄頁：依登錄表產生工具卡片。外部工具另開分頁，並標「需登入」「另開網站」。
export function renderToolList(list, tools) {
  for (const t of tools) {
    const external = t.type === 'external';
    const a = document.createElement('a');
    a.className = 'tool-btn';
    if (external) {
      a.href = t.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.href = t.path + 'index.html';
    }
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = t.name;
    const labels = external ? [...(t.requiresLogin ? ['需登入'] : []), '另開網站'] : t.status !== '上線' ? [t.status] : [];
    for (const label of labels) {
      const b = document.createElement('span');
      b.className = 'badge';
      b.textContent = label;
      name.append(b);
    }
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = t.description;
    a.append(name, desc);
    list.append(a);
  }
}
