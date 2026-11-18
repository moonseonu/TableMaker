import {esc} from '../common/util.js';

const MAX = 8;

// 데이터 조회 처음 화면의 '최근' 칩: 목록에서 고르거나 결과에서 칸으로 간 ID만 남긴다(치는 중에 거친 1 · 10 · 101은 안 남게).
// 프로젝트마다 이 브라우저에 저장 (메모와 같은 방식). 칩을 누르면 onPick(id), ✕는 그 칩만, '지우기'는 전부
export class LookupRecent {
  static key(id) { return 'tablemaker.lookup.' + id; }

  constructor(app, el, onPick) {
    this.app = app;
    this.el = el;
    el.addEventListener('mousedown', e => e.preventDefault()); // 검색 칸 포커스를 뺏지 않게
    el.addEventListener('click', e => {
      const chip = e.target.closest('[data-id]');
      if (e.target.closest('[data-clear]')) this.save([]);
      else if (e.target.closest('[data-x]')) this.save(this.list().filter(x => x.id !== chip.dataset.id));
      else if (chip) return onPick(chip.dataset.id);
      this.render();
    });
  }

  get key() { return LookupRecent.key(this.app.projects.cur); }

  list() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; } }

  save(list) { try { if (list.length) localStorage.setItem(this.key, JSON.stringify(list)); else localStorage.removeItem(this.key); } catch {} }

  // 맨 앞으로 (같은 ID는 한 번만)
  add(id, table) { this.save([{id, t: table}, ...this.list().filter(x => x.id !== id)].slice(0, MAX)); }

  render() {
    const list = this.list();
    this.el.hidden = !list.length;
    this.el.innerHTML = list.length ? `<div class="rh"><span>최근</span><button data-clear>지우기</button></div><div class="lkchips">` +
      list.map(x => `<span class="lkchip" data-id="${esc(x.id)}">${esc(x.id)}<small>${esc(x.t || '')}</small><button data-x aria-label="지우기">✕</button></span>`).join('') + '</div>' : '';
  }
}
