import {esc} from '../common/util.js';
import {CheckPicker} from '../common/CheckPicker.js';

// 불러오기 목록 창: 가져올 항목(파일 · 엑셀 시트)을 체크하고, 웹이 짐작한 '들어갈 곳'(ImportPlan.classify)을 드롭다운으로 고친다.
// 새 탭인데 이미 있는 탭과 이름이 겹치면 그 아래 이름 칸(기본은 _2)에서 바로 고칠 수 있다.
// → 고른 항목들(item.dest · item.name이 고른 값으로), 취소하면 null
export class ImportPicker {
  static async pick(title, items, freeName) {
    const select = (it, i) => it.options.length
      ? `<select data-i="${i}">${it.dest ? '' : '<option value="" selected>붙일 테이블 고르기…</option>'}` + // 짝을 못 찾은 설명
        `${it.options.map(o => `<option value="${o.v}"${o.v === it.dest ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
      : '<span class="dim">붙일 테이블이 없습니다</span>';
    const rename = (it, i) => it.clash ? `<div class="rename"${it.dest === 'new' ? '' : ' hidden'}><input data-name="${i}" value="${esc(freeName(it.base))}">` +
      '<small class="warn">⚠ 같은 이름의 탭이 이미 있습니다</small></div>' : '';
    const res = await CheckPicker.pick({
      title: esc(title), ok: '불러오기',
      text: '가져올 것을 고르세요. 들어갈 곳은 웹이 먼저 짐작한 것이니, 다르면 바꿔 주세요.',
      heads: ['파일', '종류', '크기', '들어갈 곳'],
      rows: items.map((it, i) => [`<b>${esc(it.label)}</b>`, it.kind, it.size, select(it, i) + rename(it, i)]),
      checked: items.map(it => it.on && !!it.options.length),
      // 새 탭이 아니면 이름 칸은 숨긴다
      setup: d => d.addEventListener('change', e => {
        const s = e.target.closest('select[data-i]'), r = s?.parentElement.querySelector('.rename');
        if (r) r.hidden = s.value !== 'new';
      }),
      read: d => items.map((it, i) => ({dest: d.querySelector(`select[data-i="${i}"]`)?.value || '',
        name: d.querySelector(`[data-name="${i}"]`)?.value.trim() || it.base})),
    });
    if (!res) return null;
    return res.picked.filter(i => items[i].options.length).map(i => Object.assign(items[i], res.values[i]));
  }
}
