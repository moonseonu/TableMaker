const INDEX = 'tablemaker.projects', OLD = 'tablemaker.v2';

// 프로젝트 목록 (이 브라우저에 저장). 프로젝트마다 탭 묶음(Workbook)을 따로 저장한다(Projects.key).
// 프로젝트가 하나뿐이던 예전 저장본(tablemaker.v2)은 처음 열 때 첫 프로젝트 '내 프로젝트'로 복사한다(원본은 그대로 둔다)
// ponytail: localStorage라 모든 프로젝트를 합쳐 5MB 정도까지. 넘치면 IndexedDB로
export class Projects {
  static load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(INDEX)); } catch {}
    if (!d || !d.list || !d.list.length) {
      d = {list: [{id: 'p1', name: '내 프로젝트'}], cur: 'p1'};
      try { const old = localStorage.getItem(OLD); if (old && !localStorage.getItem(Projects.key('p1'))) localStorage.setItem(Projects.key('p1'), old); } catch {}
    }
    return new Projects(d);
  }

  static key(id) { return 'tablemaker.p.' + id; }

  constructor({list, cur}) {
    this.list = list;
    this.cur = list.some(p => p.id === cur) ? cur : list[0].id;
  }

  get current() { return this.list.find(p => p.id === this.cur); }

  save() { try { localStorage.setItem(INDEX, JSON.stringify({list: this.list, cur: this.cur})); } catch {} }

  add(name) {
    let n = 1;
    while (this.list.some(p => p.id === 'p' + n)) n++;
    const p = {id: 'p' + n, name};
    this.list.push(p);
    return p;
  }

  remove(id) {
    this.list = this.list.filter(p => p.id !== id);
    try { localStorage.removeItem(Projects.key(id)); } catch {}
    if (this.cur === id) this.cur = this.list[0].id;
  }
}
