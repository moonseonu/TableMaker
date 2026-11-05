import {esc} from '../../common/util.js';
import {Table} from '../../data/Table.js';

// 타입 줄을 접었는지 이 브라우저에 기억하는 키 (테이블마다가 아니라 화면 설정)
const TYPES_KEY = 'tablemaker.hideTypes';

// 사슬 모양 아이콘. 글자색(currentColor)을 따라서 켜짐·꺼짐을 색으로 보여줄 수 있다 (이모지는 색이 안 바뀐다)
const LINK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

// 표 HTML 만들기: 가로·세로 보기, 컬럼 머리(이름 칸 · 타입 칸), 칸, 타입 줄 접기.
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class GridHtml {
  // ⇄ 옆 버튼: 타입 줄(가로 보기는 타입 행, 세로 보기는 타입 열)을 통째로 접고 편다. 타입은 처음 한 번 정하고
  // 그 뒤로는 값만 적는 일이 많아서, 입력할 때 접어 두면 화면이 덜 붐빈다. 접어도 오류 칸 표시는 그대로
  get typesHidden() {
    try { return localStorage.getItem(TYPES_KEY) === '1'; } catch { return false; }
  }

  showTypes(on) {
    try { on ? localStorage.removeItem(TYPES_KEY) : localStorage.setItem(TYPES_KEY, '1'); } catch {}
    this.el.classList.toggle('notype', !on);
    const b = this.el.querySelector('#typeToggle'), flip = this.t.flip;
    b.textContent = on ? (flip ? '«' : '︽') : (flip ? '»' : '︾');
    b.title = on ? '타입 줄 접기' : '타입 줄 펴기 (타입 바꾸기 · 열 삭제)';
    b.classList.toggle('on', !on);
  }

  // 두 번째 머리(가로: 타입 행, 세로: 타입 열)가 스크롤해도 첫 머리 바로 옆에 붙어 있게 첫 머리의 높이·너비를 CSS에 알려 준다
  stickHeads() {
    const first = this.el.querySelector(this.t.flip ? 'tbody th.colhead' : 'thead tr');
    // 소수점까지 (정수로 자르면 두 머리 사이에 0.x px 틈이 생긴다)
    if (first) this.el.style.setProperty(this.t.flip ? '--w1' : '--h1', first.getBoundingClientRect()[this.t.flip ? 'width' : 'height'] + 'px');
  }

  // 가로 보기: 열 = 컬럼, 행 = 데이터 한 줄
  normalHtml(corner, ghostColHead) {
    const t = this.t;
    // 머리줄 두 행: 이름, 타입. 맨 오른쪽 빈 열은 채우는 순간 진짜 열이 되고, 비어 있으면 JSON에 안 나온다
    let h = '<thead><tr class="hname">' + corner;
    // 이름 칸 오른쪽 경계의 손잡이: 끌어서 열 너비, 두 번 누르면 글자에 맞춤 (ColumnWidth)
    t.cols.forEach((c, i) => h += `<th data-c="${i}"${this.moveTip(c)}>${this.nameHead(c, i)}` +
      `<span class="colgrip${c.width ? ' set' : ''}" data-grip="${i}" title="끌어서 열 너비 조절 · 두 번 누르면 글자에 맞춤"></span></th>`);
    h += `<th class="ghost">${ghostColHead}</th></tr><tr class="htype"><th class="num"></th>`;
    t.cols.forEach((c, i) => h += `<th data-tc="${i}">${this.typeHead(c, i)}</th>`);
    h += '<th class="ghost"></th></tr></thead><tbody>';
    // 데이터 행은 두 빈 줄(padtop · padbot) 사이에 보이는 것만 들어간다 (fillRows)
    const pad = cls => `<tr class="pad ${cls}"><td colspan="${t.cols.length + 2}"></td></tr>`;
    h += pad('padtop') + pad('padbot');
    // 맨 아래 빈 행: 열과 같은 규칙. 채우는 순간 진짜 행이 된다
    h += '<tr class="ghostrow"><td class="num"></td>' + t.cols.map((c, ci) => this.cellHtml(c, ci, '', 'data-ghostrow')).join('') + '<td></td></tr>';
    return h + '</tbody>';
  }

  rowsHtml(first, last) {
    const t = this.t;
    let h = '';
    for (let ri = first; ri <= last; ri++) {
      const r = t.rows[ri];
      h += `<tr><td class="num">${ri + 1}<button class="ico del" data-delrow="${ri}" title="행 삭제">✕</button></td>`;
      t.cols.forEach((c, ci) => h += this.cellHtml(c, ci, r[ci], `data-r="${ri}"`));
      h += `<td class="ghost"><input data-ghost data-gr="${ri}"></td></tr>`;
    }
    return h;
  }

  // 세로 보기(Config처럼 열이 많은 테이블): 줄 = 컬럼, 칸 = 데이터 한 줄. 데이터와 JSON은 그대로이고 보는 방향만 다르다.
  // 칸의 data-r · data-c는 가로 보기와 같은 뜻이라 입력·검사·붙여넣기 코드는 그대로 쓴다
  flippedHtml(corner, ghostColHead) {
    const t = this.t;
    // 머리 열 두 개: 이름, 타입 (가로 보기의 두 머리 행을 돌린 것)
    let h = '<thead><tr>' + corner + '<th class="num tcol"></th>';
    t.rows.forEach((r, ri) => h += `<th class="num rowhead">${ri + 1}<button class="ico del" data-delrow="${ri}" title="행 삭제">✕</button></th>`);
    h += '<th class="num rowhead ghostcell"></th></tr></thead><tbody>';
    t.cols.forEach((c, ci) => {
      h += `<tr><th class="colhead" data-c="${ci}"${this.moveTip(c)}>${this.nameHead(c, ci)}</th><th class="colhead tcol" data-tc="${ci}">${this.typeHead(c, ci)}</th>`;
      t.rows.forEach((r, ri) => h += this.cellHtml(c, ci, r[ci], `data-r="${ri}"`));
      h += this.cellHtml(c, ci, '', 'data-ghostrow') + '</tr>'; // 맨 오른쪽: 새 행
    });
    // 맨 아래: 새 열
    h += `<tr><th class="colhead ghost">${ghostColHead}</th><th class="colhead tcol"></th>` + t.rows.map((r, ri) => `<td class="ghost"><input data-ghost data-gr="${ri}"></td>`).join('') + '<td></td></tr>';
    return h + '</tbody>';
  }

  moveTip(c) { return c.id ? '' : ' title="꾹 눌러 끌면 순서 바꾸기"'; }

  // 컬럼 머리는 두 칸: 이름 칸(nameHead, th[data-c])과 타입·버튼 칸(typeHead, th[data-tc]).
  // 가로 보기는 위아래 두 행, 세로 보기는 왼쪽 두 열이 된다. 열 고르기·옮기기·오류 표시는 이름 칸(th[data-c])으로 한다
  // 열 삭제 ✕는 이름 칸 오른쪽 끝에 (타입 줄을 접어도 펴도 같은 자리)
  nameHead(c, i) {
    return `<div class="col"><input class="cname" data-c="${i}" value="${esc(c.name)}"><button class="ico namedel" data-delcol="${i}" title="열 삭제">✕</button></div>`;
  }

  typeHead(c, i) {
    const t = this.t, sort = t.sortOf(), cands = this.app.workbook.refCandidates(t);
    let h = `<div class="col"><select data-c="${i}" title="${Table.TIPS[c.id ? 'id' : c.type]}"${c.linked ? ' disabled' : ''}>${Object.entries({id: 'ID', ...Table.TYPES}).map(([k, v]) =>
      `<option value="${k}" title="${Table.TIPS[k]}"${k === (c.id ? 'id' : c.type) ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
    // 참조 대상에 같은 이름 열이 있으면 🔗 켜기/끄기. 기본은 켜짐(파랗게 눌린 상태)
    if (c.linkable) h += `<button class="ico link${c.linked ? ' on' : ''}" data-link="${i}" title="${c.linked
      ? `${esc(t.refs.join(' · '))}의 ${esc(c.name)}에서 가져오는 중. 누르면 연결을 끊고 직접 입력합니다`
      : `연결 끊김. 누르면 ${esc(t.refs.join(' · '))}의 ${esc(c.name)} 값으로 다시 채웁니다`}">${LINK_ICON}</button>`;
    // 접두사·참조는 처음 한 번 정하는 설정이라 ⚙ 안에 둔다. 설정돼 있으면 ⚙가 파랗다
    if (c.id) h += `<details class="opt idopt"><summary class="ico${t.prefix || t.refs.length ? ' set' : ''}" title="ID 설정 (접두사 · 참조)">⚙</summary><div class="pop">` +
      `<label title="기본은 화면에만 표시되고 JSON에는 번호만 정수로 나갑니다">접두사 <input class="prefix" value="${esc(t.prefix)}" placeholder="예: item_"></label>` +
      `<label title="켜면 JSON에 접두사까지 붙여 &quot;item_1001&quot; 같은 문자로 내보냅니다"><input type="checkbox" class="pout"${t.prefixOut ? ' checked' : ''}> JSON에 포함</label>` +
      `<label title="${cands.length ? 'ID가 다른 테이블의 ID를 가리킬 때 (예: Localization → items). 여러 테이블을 고를 수 있고, 이름이 같은 열은 그 ID가 있는 테이블 값으로 채워집니다' : '참조할 수 있는 다른 테이블(ID 열이 있는 탭)이 없습니다'}">` +
      `<input type="checkbox" class="refon"${t.refs.length ? ' checked' : ''}${cands.length ? '' : ' disabled'}> 다른 테이블 참조</label>` +
      // 참조 중이면 대상 테이블을 체크로 고른다 (여러 개 가능)
      (t.refs.length ? '<div class="refs">' + cands.map(o => `<label><input type="checkbox" class="refpick" value="${esc(o.name)}"${t.refs.includes(o.name) ? ' checked' : ''}> ${esc(o.name)}</label>`).join('') + '</div>' : '') +
      '</div></details>';
    // Enum 값 목록 보기(보기만). 칸을 고칠 때마다 바뀌어서 열 때 채운다(onToggle)
    if (c.type === 'enum' && !c.linked) h += `<details class="opt enumopt" data-c="${i}"><summary class="ico" title="Enum 값 목록 보기">⚙</summary><div class="pop"></div></details>`;
    // 정렬은 ID 열만: ▼ 오름차순(작은 값이 위), ▲ 내림차순.
    // 다른 열로 정렬하면 JSON 순서까지 바뀌고 ID 자동 정렬이 꺼져서 뺐다
    if (c.id) h += `<button class="ico sort on" data-sort="${i}" title="${sort.dir > 0
      ? '오름차순 · 누르면 내림차순' : '내림차순 · 누르면 오름차순'}">${sort.dir > 0 ? '▼' : '▲'}</button>`;
    return h + '</div>';
  }

  // 참조 대상에서 가져온 칸(linked)은 회색으로 잠근다. Tab 키로는 건너뛴다
  cellHtml(c, ci, v, attr) {
    if (c.id) return `<td><div class="idbox"><span class="pre">${esc(this.t.prefix)}</span><input ${attr} data-c="0" value="${esc(v)}" inputmode="numeric" placeholder="번호"></div></td>`;
    // Bool 칸은 값이 true · false · 빈칸일 때만 체크박스. 그 외 값은 글자 그대로 보여주고 빨간 칸이 된다(타입을 바꿔도 값은 그대로라서)
    if (c.type === 'bool' && /^(true|false|)$/.test(v)) return `<td class="chk${c.linked ? ' linked' : ''}"><input type="checkbox" ${attr} data-c="${ci}"${v === 'true' ? ' checked' : ''}${c.linked ? ' disabled' : ''}></td>`;
    return `<td${c.linked ? ' class="linked"' : ''}><input ${attr} data-c="${ci}" value="${esc(v)}"${c.linked ? ' readonly tabindex="-1"' : ''}></td>`;
  }
}
