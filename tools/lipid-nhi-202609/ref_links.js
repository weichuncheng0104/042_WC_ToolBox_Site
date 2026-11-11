// 內文提到表一、表二、statin 強度處掛連結，點擊開專用頁小視窗（S30）。
// 連結不帶任何網址參數，專用頁不讀病人資料；只動畫面，不改引擎文字。
export const REFS = {
  t1: { href: 'table1.html', win: 'ref_table1' },
  t2: { href: 'table2.html', win: 'ref_table2' },
  si: { href: 'statin_intensity.html', win: 'ref_intensity' },
  l2: { href: 'list_262.html', win: 'ref_list262' },
  l3: { href: 'list_263.html', win: 'ref_list263' },
};
const RE = /(?<!附)表[一二]|(?:中至高|高|中|低)強度(?:／高強度)?(?: ?statin)?|statin 強度(?:參考表?)?|強度參考表?/g;
const refOf = (s) => (s === '表一' ? 't1' : s === '表二' ? 't2' : 'si');

// 純函式：文字 → [{ text, ref? }]；各段接回等於原文
export function splitRefs(text) {
  const out = [];
  let at = 0;
  for (const m of text.matchAll(RE)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: m[0], ref: refOf(m[0]) });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

const SKIP = new Set(['A', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION', 'SCRIPT', 'STYLE']);

// 走訪 root 底下的文字節點，把符合的字樣換成連結（摘要 textarea 等不動）
export function linkRefs(root) {
  const skip = (n) => { for (let p = n.parentElement; p && p !== root.parentElement; p = p.parentElement) if (SKIP.has(p.tagName)) return true; return false; };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (!skip(walker.currentNode)) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const parts = splitRefs(n.nodeValue);
    if (!parts.some((p) => p.ref)) continue;
    n.replaceWith(...parts.map((p) => {
      if (!p.ref) return p.text;
      const a = document.createElement('a');
      a.className = 'ref-link';
      a.textContent = p.text;
      a.href = REFS[p.ref].href;
      a.target = REFS[p.ref].win;
      a.dataset.ref = p.ref;
      return a;
    }));
  }
}

// 點擊開小視窗；被擋或手機不支援時瀏覽器照 target 開分頁。同一張表重複點擊沿用同一視窗。
export function installRefPopup() {
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a.ref-link');
    if (!a) return;
    const w = window.open(a.href, a.target, 'popup,width=960,height=720');
    if (w) { ev.preventDefault(); w.focus(); }
  });
}
