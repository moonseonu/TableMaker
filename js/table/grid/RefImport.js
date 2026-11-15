import {esc} from '../../common/util.js';

// 다른 테이블 참조: 참조한 테이블에는 있는데 여기에는 없는 ID를 새 줄로 불러온다 (ID ⚙ → ID 불러오기 (N)).
// 참조가 하나면 바로 불러오고, 둘 이상이면 고르는 창을 띄운다(다 불러온 테이블은 회색으로 꺼 둔다).
// 이름이 같은 열(🔗)은 다시 그릴 때 syncRef가 참조 값으로 채운다. 지우기는 하지 않는다(대상에서 사라진 ID는 노란 칸으로만)
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class RefImport {
  // 참조 테이블마다 여기 없는 ID (그 테이블에 적힌 글자 그대로, 같은 번호는 한 번만) → [{o, ids}]
  refMissing() {
    const t = this.t, have = new Set(t.rows.filter(r => r[0] !== '').map(r => String(+r[0])));
    return this.app.workbook.refTargets(t).map(o => {
      const ids = new Map();
      for (const r of o.rows) if (r[0] !== '' && !have.has(String(+r[0])) && !ids.has(String(+r[0]))) ids.set(String(+r[0]), r[0]);
      return {o, ids: [...ids.values()]};
    });
  }

  // 고른 테이블들의 ID를 합친다. 두 테이블에 같은 번호가 있으면 앞 테이블 것으로 한 번만 → {ids, by: [[이름, 개수]]}
  static union(list) {
    const seen = new Set(), ids = [], by = [];
    for (const {o, ids: own} of list) {
      let n = 0;
      for (const v of own) if (!seen.has(String(+v))) { seen.add(String(+v)); ids.push(v); n++; }
      if (n) by.push([o.name, n]);
    }
    return {ids, by};
  }

  // ⚙ 창의 참조 목록 아래 버튼 (불러올 ID가 없거나 잠근 테이블이면 없음)
  refImportHtml() {
    if (this.t.locked) return '';
    const n = RefImport.union(this.refMissing()).ids.length;
    return n ? `<div class="refload"><button type="button" class="primary" data-refload>ID 불러오기 (${n})</button></div>` : '';
  }

  // ⚙를 열 때마다 개수를 다시 센다 (그사이 칸을 적었거나 다른 탭의 대상 테이블이 바뀌었을 수 있어서)
  onRefToggle(e) {
    const d = e.target;
    if (!d.open || !d.classList.contains('idopt')) return;
    d.querySelector('.refload')?.remove();
    d.querySelector('.refs')?.insertAdjacentHTML('afterend', this.refImportHtml());
  }

  async importRefIds() {
    const t = this.t, all = this.refMissing();
    const picked = all.length > 1 ? await this.pickRefTables(all) : all;
    if (!picked || t !== this.t) return;
    const {ids, by} = RefImport.union(picked);
    if (!ids.length) return;
    for (const v of ids) { const r = t.newRow(); r[0] = v; t.rows.push(r); }
    this.render(); // ID 순서로 자리 잡고, 🔗 열이 채워지고, 저장 · 되돌리기 기록 (Ctrl+Z 한 번)
    this.app.toast(`ID ${ids.length}개를 불러왔습니다 (${by.map(([name, n]) => `${name} ${n}`).join(' · ')})`);
  }

  // 참조가 둘 이상일 때: 테이블마다 체크 줄. 다 불러온 테이블은 회색으로 꺼 둔다. 버튼 숫자는 고른 테이블을 합친 수
  pickRefTables(all) {
    const d = document.createElement('dialog');
    d.className = 'popup refpickdlg';
    d.innerHTML = '<form method="dialog"><h3>ID 불러오기</h3>' +
      all.map((x, i) => `<label class="refrow${x.ids.length ? '' : ' off'}"><input type="checkbox" value="${i}"${x.ids.length ? ' checked' : ' disabled'}>` +
        `<span>${esc(x.o.name)}</span><span>${x.ids.length}개</span></label>`).join('') +
      '<div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary"></button></div></form>';
    const boxes = [...d.querySelectorAll('input')], ok = d.querySelector('.primary');
    const chosen = () => boxes.filter(b => b.checked).map(b => all[+b.value]);
    const mark = () => { const n = RefImport.union(chosen()).ids.length; ok.disabled = !n; ok.textContent = `불러오기 (${n})`; };
    d.addEventListener('change', mark);
    d.querySelector('.cancel').onclick = () => d.close('');
    mark();
    document.body.append(d);
    d.showModal();
    return new Promise(done => d.addEventListener('close', () => {
      const res = d.returnValue === 'ok' ? chosen() : null;
      d.remove();
      done(res);
    }));
  }
}
