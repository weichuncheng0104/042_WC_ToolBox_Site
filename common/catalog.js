// 目錄頁：依登錄表產生工具卡片（固定編號以數字徽章顯示；站內工具附 last_update，不顯示狀態標籤）。外部工具另開分頁，並標「需登入」「另開網站」；託管工具（hosted）另開分頁、標其 badge。
export function renderToolList(list, tools) {
  for (const t of tools) {
    const external = t.type === 'external' || t.type === 'hosted'; // hosted：程式在本 repo、託管在他站（tools.js）
    const a = document.createElement('a');
    a.className = 'tool-btn';
    if (external) {
      a.href = t.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.href = t.path + 'index.html';
    }
    const no = document.createElement('span');
    no.className = 'no';
    no.textContent = String(t.no);
    no.setAttribute('role', 'img');
    no.setAttribute('aria-label', `工具 ${t.no}`);
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = t.name;
    name.prepend(no);
    const labels = !external ? [] : t.type === 'hosted' ? [t.badge] : [...(t.requiresLogin ? ['需登入'] : []), '另開網站'];
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
    if (t.lastUpdate) {
      const lu = document.createElement('div');
      lu.className = 'last-update';
      lu.textContent = `last_update：${t.lastUpdate}`;
      a.append(lu);
    }
    list.append(a);
  }
}
