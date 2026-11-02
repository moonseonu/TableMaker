import {esc} from '../../common/util.js';

// Enum: ⚙ 값 목록 보기와 앞 글자 자동 완성.
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class EnumHint {
  // Enum ⚙를 열면 지금 칸 값으로 목록을 채운다. 열어 둔 채 칸을 고치면 update가 다시 채운다
  onToggle(e) {
    if (e.target.open && e.target.classList.contains('enumopt')) this.fillEnum(e.target);
  }

  fillEnum(d) {
    const vals = this.t.enumValues(+d.dataset.c);
    d.querySelector('.pop').innerHTML = `<b>값 목록 · ${vals.length}개</b>` +
      (vals.length ? `<ul class="enumlist">${vals.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '<span class="dim">칸에 적으면 여기 모입니다</span>');
  }

  // Enum 칸 자동 완성(엑셀처럼): 앞 글자가 맞는 목록 값의 나머지를 칸 뒤에 흐리게 보여 주고,
  // 칸을 마치면(Enter·Tab·화살표·클릭) 그 값으로 채운다. 입력값은 건드리지 않고 겹쳐 보이기만 해서 한글 조합이 깨지지 않는다.
  // 지우는 키(Backspace·Delete)를 누르면 숨겨서 친 글자 그대로 둘 수 있다
  suggest(el, e) {
    const col = el.dataset.r != null && this.t.cols[el.dataset.c], v = el.value;
    const m = col && col.type === 'enum' && !col.linked && el.dataset.mode !== 'select' && v && !/^delete/.test(e.inputType || '')
      && el.selectionStart === v.length && this.t.enumValues(+el.dataset.c).find(x => x.length > v.length && x.toLowerCase().startsWith(v.toLowerCase()));
    if (!m) return this.hideHint();
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    this.hint.innerHTML = `<i>${esc(v)}</i>${esc(m.slice(v.length))}`;
    Object.assign(this.hint.style, {display: 'block', font: cs.font, left: r.left + parseFloat(cs.paddingLeft) + 'px',
      top: r.top + 'px', height: r.height + 'px', lineHeight: r.height + 'px'});
    this.hintFor = {el, value: m};
  }

  hideHint() { this.hint.style.display = 'none'; this.hintFor = null; }
}
