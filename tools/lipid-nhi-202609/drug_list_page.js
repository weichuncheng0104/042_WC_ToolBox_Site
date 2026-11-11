// 完整藥物清單頁（表一／表二）：資料 drug_list.js（由 script/extract_drug_list.js 自健保署用藥品項 CSV 產生）。
// 只顯示，不讀也不寫評估工具的病人資料；不載入外部資源。
import { TOOLS } from '../../tools.js';
import { renderHeader, renderFooter } from '../../common/layout.js';
import { renderPendingNotice } from '../../common/pending.js';
import { DRUG_LIST } from './drug_list.js';
import { sourceLine, matches, sections, zeroPriceNote } from './drug_list_view.js';
import { drugTable } from './ref_views.js';

const tool = TOOLS.find((t) => t.id === 'lipid-nhi-202609');
renderHeader('../../');
const back = document.createElement('a');
back.href = 'index.html';
back.textContent = '← 返回評估工具';
document.querySelector('.site-header .title').before(back);
renderFooter({ regulation: tool.regulation, officialUrl: tool.officialUrl, lastUpdate: tool.lastUpdate });
renderPendingNotice(tool);

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const S = DRUG_LIST.source;
const srcLink = el('a', '', S.dataset);
srcLink.href = S.url;
srcLink.target = '_blank';
srcLink.rel = 'noopener noreferrer';
$('src').append(el('b', '', `資料版本：${sourceLine(DRUG_LIST.source)}`), el('br'), '來源：', srcLink, `（政府資料開放平臺 resource ${S.resource}，月更新）`);
$('zero-price').textContent = zeroPriceNote(DRUG_LIST.zeroPriceExcluded);

const SECTIONS = sections(DRUG_LIST);
// 未輸出的區塊（例：無法分類 0 筆）隱藏
for (const box of document.querySelectorAll('section[data-list]')) {
  if (!SECTIONS.some((s) => s.id === box.id)) box.hidden = true;
}

function render() {
  const q = $('q').value;
  let shown = 0;
  for (const s of SECTIONS) {
    const hits = s.items.filter((d) => matches(d, q));
    shown += hits.length;
    const box = $(s.id);
    box.replaceChildren(el('h2', '', `${s.title}：${hits.length}${q.trim() ? `／${s.items.length}` : ''} 筆`));
    if (s.note) box.append(el('p', 'emph', s.note));
    box.append(hits.length ? drugTable(hits) : el('p', 'hint', '無符合品項。'));
  }
  $('q-count').textContent = q.trim() ? `符合 ${shown} 筆` : '';
}
$('q').addEventListener('input', render);
render();
