import {StorageFull} from '../data/StorageFull.js';

// 오른쪽 여백의 메모장 (커밋 메시지 · 작업 기록용). 프로젝트마다 이 브라우저에 따로 저장하고, 쓰는 대로 바로 저장한다.
// 넓은 화면에서는 늘 떠 있고 닫기 버튼은 없다(닫아도 그 자리는 비어 있을 뿐이라). 좁은 화면(1100px 미만)에서는 여백이 좁아 숨긴다(CSS)
export class Memo {
  static key(id) { return 'tablemaker.memo.' + id; }

  constructor(app) {
    this.app = app;
    this.box = document.getElementById('memo');
    this.box.addEventListener('input', () => this.save());
    this.load();
  }

  get key() { return Memo.key(this.app.projects.cur); }

  // 프로젝트를 열거나 바꿀 때 그 프로젝트의 메모로
  load() {
    try { this.box.value = localStorage.getItem(this.key) || ''; } catch { this.box.value = ''; }
  }

  save() {
    try {
      if (this.box.value) localStorage.setItem(this.key, this.box.value); else localStorage.removeItem(this.key);
      StorageFull.saved();
    } catch (e) { StorageFull.failed(e); }
  }
}
