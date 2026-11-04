import {esc} from './util.js';

// 입력칸 + 아래로 펼치는 목록 (직접 적어도 되고 목록에서 골라도 되는 칸).
// 브라우저 기본 <datalist>는 팝업 창(dialog) 안에서 목록이 화면 엉뚱한 곳에 뜰 때가 있어서 직접 그린다.
// 칸 아무 데나 누르면 전체 목록이 열리고, 다시 누르면 닫힌다(▾는 표시만). 글자를 적으면 그 글자가 든 것만.
// 마우스로 고르거나 ↑↓ + Enter, Esc는 목록만 닫는다. 목록이 비었으면(아직 받는 중이거나 없음) empty 안내를 보인다.
// 고르면 입력칸에 input 이벤트를 보낸다.
// actions: 목록 맨 아래에 늘 붙는 동작 줄 [{label, run}] (예: + 새 폴더…). 누르면 목록을 닫고 run()
export class Combo {
  constructor(input, empty = '고를 것이 없습니다. 직접 적어도 됩니다', actions = []) {
    this.input = input;
    this.items = [];
    this.empty = empty;
    this.actions = actions;
    const wrap = Object.assign(document.createElement('div'), {className: 'combo'});
    input.replaceWith(wrap);
    this.btn = Object.assign(document.createElement('span'), {className: 'combo-btn', textContent: '▾'});
    this.list = Object.assign(document.createElement('ul'), {className: 'combo-list', hidden: true});
    wrap.append(input, this.btn, this.list);
    input.autocomplete = 'off';
    input.addEventListener('click', () => this.list.hidden ? this.show(false) : this.hide());
    input.addEventListener('input', () => { if (!this.picking) this.show(true); });
    input.addEventListener('blur', () => this.hide());
    input.addEventListener('keydown', e => this.key(e));
    // 누를 때 입력칸 포커스를 뺏지 않게 (blur로 목록이 먼저 닫히지 않게)
    this.list.onmousedown = e => { e.preventDefault(); const li = e.target.closest('li:not(.none)'); if (li) this.choose(li); };
    this.list.onclick = e => e.preventDefault(); // <label> 안이라 클릭이 입력칸으로 넘어가 목록이 다시 열리지 않게
  }

  set(items) {
    this.items = items;
    if (!this.list.hidden) this.show(this.filtering);
  }

  show(filter) {
    this.filtering = filter;
    const q = filter ? this.input.value.trim().toLowerCase() : '';
    const list = this.items.filter(v => v.toLowerCase().includes(q));
    this.list.innerHTML = (list.length ? list.map(v => `<li>${esc(v)}</li>`).join('') : `<li class="none">${esc(filter && this.items.length ? '맞는 것이 없습니다. 적은 그대로 씁니다' : this.empty)}</li>`) +
      this.actions.map((a, i) => `<li class="act" data-act="${i}">${esc(a.label)}</li>`).join('');
    this.list.hidden = false;
    this.at = -1;
  }

  hide() { this.list.hidden = true; }

  choose(li) {
    if (li.dataset.act == null) return this.pick(li.textContent);
    this.hide();
    this.actions[+li.dataset.act].run();
  }

  pick(v) {
    this.input.value = v;
    this.picking = true;
    this.input.dispatchEvent(new Event('input', {bubbles: true}));
    this.picking = false;
    this.hide();
  }

  key(e) {
    const lis = [...this.list.querySelectorAll('li:not(.none)')];
    if (e.key === 'ArrowDown' && this.list.hidden) { this.show(false); e.preventDefault(); return; }
    if (this.list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.at = Math.max(0, Math.min(lis.length - 1, this.at + (e.key === 'ArrowDown' ? 1 : -1)));
      lis.forEach((li, i) => li.classList.toggle('on', i === this.at));
      lis[this.at]?.scrollIntoView({block: 'nearest'});
    } else if (e.key === 'Enter' && this.at >= 0) {
      e.preventDefault(); // 창의 '확인'으로 넘어가지 않게
      this.choose(lis[this.at]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); // 창은 닫지 않고 목록만
      this.hide();
    }
  }
}
