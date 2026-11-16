import {esc} from '../common/util.js';

// 데이터 조회 칸 아래로 펼치는 ID 목록 (어떤 ID가 있는지 몰라도 찾게). 숫자를 칠 때만 열린다.
// source(앞자리) → [{id, sub}] (작은 순서). 마우스로 누르거나 ↑↓ + Enter로 고르면 칸을 그 ID로 채우고 input 이벤트를 보낸다.
// Esc · 칸 밖을 누르면 닫는다. 길면 목록 안에서 스크롤 (아래 창 밖으로 넘치지 않게 높이를 맞춘다)
export class IdSuggest {
  constructor(input, source) {
    this.input = input;
    this.source = source;
    this.items = [];
    this.at = -1;
    const wrap = Object.assign(document.createElement('span'), {className: 'idsug'});
    input.replaceWith(wrap);
    this.list = Object.assign(document.createElement('ul'), {className: 'combo-list', hidden: true});
    wrap.append(input, this.list);
    input.addEventListener('input', () => { if (!this.picking) this.show(); });
    input.addEventListener('blur', () => this.hide());
    input.addEventListener('keydown', e => this.key(e));
    // 누를 때 칸 포커스를 뺏지 않게 (blur로 목록이 먼저 닫히지 않게)
    this.list.onmousedown = e => { e.preventDefault(); const li = e.target.closest('li[data-id]'); if (li) this.pick(li.dataset.id); };
  }

  show() {
    const m = /(\d+)\s*$/.exec(this.input.value);
    this.items = m ? this.source(m[1]) : [];
    // 친 것이 이미 하나뿐인 ID 그대로면 목록은 필요 없다 (결과가 바로 아래에 나온다)
    if (!this.items.length || this.items.length === 1 && this.items[0].id === String(+m[1])) return this.hide();
    this.list.innerHTML = this.items.map(x => `<li data-id="${x.id}"><span>${x.id}</span><small>${esc(x.sub)}</small></li>`).join('');
    this.list.hidden = false;
    this.list.scrollTop = 0;
    this.at = -1;
    // 아래 창 바닥까지만 (8줄 정도가 넘으면 스크롤)
    const room = this.input.closest('section').getBoundingClientRect().bottom - this.input.getBoundingClientRect().bottom - 8;
    this.list.style.maxHeight = Math.max(90, Math.min(220, room)) + 'px';
  }

  hide() { this.list.hidden = true; }

  pick(id) {
    this.input.value = id;
    this.picking = true;
    this.input.dispatchEvent(new Event('input', {bubbles: true}));
    this.picking = false;
    this.hide();
  }

  key(e) {
    if (e.key === 'ArrowDown' && this.list.hidden) { this.show(); e.preventDefault(); return; }
    if (this.list.hidden) return;
    const lis = this.list.children;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.at = Math.max(0, Math.min(lis.length - 1, this.at + (e.key === 'ArrowDown' ? 1 : -1)));
      [...lis].forEach((li, i) => li.classList.toggle('on', i === this.at));
      lis[this.at].scrollIntoView({block: 'nearest'});
    } else if (e.key === 'Enter' && this.at >= 0) {
      e.preventDefault();
      this.pick(lis[this.at].dataset.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  }
}
