import {esc} from '../common/util.js';
import {Table} from '../data/Table.js';

const CAP = 100; // '쓰는 곳' 표에 보여 줄 줄 수

// 데이터 조회 결과 (화면과 무관한 찾기 + 그리기 글자).
//   오브젝트: 그 ID를 ID 열에 가진 테이블들. 다른 쪽을 ID로 참조하는 테이블은 그 테이블에 합쳐(Unity에서 구운 모양) 하나로 본다
//   쓰는 곳: 이름이 ID로 끝나는 열(ItemID 등)에 그 값이 적힌 줄, 테이블별로
export class LookupResult {
  constructor(tables, id) {
    this.id = id;
    const eq = v => /^\d+$/.test(v) && String(+v) === id;
    const owners = [];
    for (const t of tables) {
      const row = t.hasId && t.rows.find(r => eq(r[0]));
      if (row) owners.push({t, row});
    }
    const names = new Set(owners.map(o => o.t.name)), joins = o => o.t.refs.some(n => names.has(n));
    this.objs = owners.filter(o => !joins(o)).map(o => [o]);
    // ponytail: 참조가 여러 단(A ← B ← C)이면 탭 순서에 따라 C가 따로 나올 수 있다. 그런 구성이 생기면 차례로 다시 붙이기
    for (const o of owners.filter(joins)) {
      const host = this.objs.find(g => g.some(m => o.t.refs.includes(m.t.name)));
      if (host) host.push(o); else this.objs.push([o]);
    }
    this.uses = [];
    for (const t of tables) {
      const rows = [];
      t.cols.forEach((c, i) => {
        if (c.id || c.linked || !/id$/i.test(c.name)) return;
        for (const row of t.rows) if (eq(row[i])) rows.push({row, c: i});
      });
      if (rows.length) this.uses.push({t, rows});
    }
  }

  get empty() { return !this.objs.length && !this.uses.length; }

  // 왼쪽 목록(좁은 창에서는 칩 줄)에 놓을 것: o0, o1… 오브젝트, u0, u1… 쓰는 곳
  get keys() { return [...this.objs.map((_, i) => 'o' + i), ...this.uses.map((_, i) => 'u' + i)]; }

  // 최근 기록에 붙일 테이블 이름
  get first() { return (this.objs[0] ? this.objs[0][0] : this.uses[0]).t.name; }

  listHtml(sel) {
    const item = (key, name, sub) => `<button class="lkitem${key === sel ? ' on' : ''}" data-item="${key}"><b>${esc(name)}</b>${sub}</button>`;
    return (this.objs.length ? '<div class="lh">오브젝트</div>' : '') +
      this.objs.map((g, i) => item('o' + i, g[0].t.name, g.length > 1 ? `<small>+ ${esc(g.slice(1).map(m => m.t.name).join(' · '))}</small>` : '')).join('') +
      (this.uses.length ? '<div class="lh">쓰는 곳</div>' : '') +
      this.uses.map((u, i) => item('u' + i, u.t.name, `<span class="cnt">${u.rows.length}</span>`)).join('');
  }

  detailHtml(sel) {
    const i = +sel.slice(1);
    return sel[0] === 'o' ? this.objHtml(this.objs[i]) : this.useHtml(this.uses[i]);
  }

  // 합친 오브젝트: ID는 맨 위에 한 번, 같은 이름 · 같은 값은 한 줄로, 같은 이름인데 값이 다르면 노란 줄로 남긴다
  objHtml(g) {
    const root = g[0].t, seen = new Map();
    let rows = '';
    g.forEach((m, mi) => {
      rows += `<tr class="g"><td colspan="2">${esc(m.t.name)}</td></tr>`;
      m.t.cols.forEach((c, ci) => {
        if (c.id || c.linked) return;
        const v = m.row[ci], s = seen.get(c.name);
        if (s && s.v === v) return;
        if (!s) seen.set(c.name, {v, t: m.t.name});
        rows += `<tr${s ? ' class="diff"' : ''}><td class="k">${esc(c.name)}<small>${Table.TYPES[c.type]}</small></td>` +
          `<td class="v" data-m="${mi}" data-c="${ci}"><span class="go">↗</span>${LookupResult.val(c, v)}${s ? `<span class="lkdiff">${esc(s.t)} 값과 다름</span>` : ''}</td></tr>`;
      });
    });
    // 조회는 보기만 한다(고치기는 표에서만: 검사 · 정렬 · 되돌리기가 거기 있어서). 값 칸을 누르면 그 테이블의 그 칸으로 (필드 이름 칸은 누르는 곳이 아니다)
    return `<div class="lkoh"><span class="lkid">${esc(root.prefix + this.id)}</span><span class="lksrc">${esc(root.name)}</span></div><table class="lkobj">${rows}</table>`;
  }

  // 값은 타입에 맞게: 빈 값 –, Bool ✓ · ✗, Enum 배지, 숫자는 고정폭, 이름이 ID로 끝나는 칸의 번호는 눌러서 그 ID로 다시 조회
  static val(c, v) {
    if (v === '') return '<span class="lkdim">–</span>';
    if (c.type === 'bool') return v === 'true' ? '<span class="lkok">✓</span>' : '<span class="lkdim">✗</span>';
    if (c.type === 'enum') return `<span class="lkbadge">${esc(v)}</span>`;
    if (/id$/i.test(c.name) && /^\d+$/.test(v)) return `<button class="lklink" data-q="${+v}">${esc(v)}</button>`;
    if (c.type === 'int' || c.type === 'float') return `<span class="lknum">${esc(v)}</span>`;
    return esc(v);
  }

  // 쓰는 곳: 그 테이블에서 이 ID가 적힌 줄 (누르면 그 칸으로)
  useHtml(u) {
    const t = u.t;
    const cell = (x, ci) => {
      const v = esc((t.cols[ci].id ? t.prefix : '') + x.row[ci]);
      return `<td>${ci === x.c ? `<mark>${v}</mark>` : v}</td>`;
    };
    return `<div class="lkoh"><b>${esc(t.name)}</b><span class="lksrc">${esc(u.rows.map(x => t.cols[x.c].name).filter((n, i, a) => a.indexOf(n) === i).join(' · '))} 열</span></div>` +
      `<div class="lktbl"><table><tr>${t.cols.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr>` +
      u.rows.slice(0, CAP).map((x, ri) => `<tr data-u="${ri}">${t.cols.map((_, ci) => cell(x, ci)).join('')}</tr>`).join('') +
      `</table></div>${u.rows.length > CAP ? `<p class="lkempty">${u.rows.length - CAP}줄 더</p>` : ''}`;
  }
}
