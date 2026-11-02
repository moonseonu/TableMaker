import {Table} from '../data/Table.js';

// 테이블 설명을 바깥 형식과 주고받는다: 설명서(.md) 만들기·읽기, 엑셀 Meta 시트 읽기

// 엑셀 Meta 시트의 머리줄. 사람마다 이름과 순서가 달라서 알려진 이름 표본으로 열을 찾는다 (대소문자·띄어쓰기·_ 무시)
const HEAD = {
  column: ['column', 'columns', 'columnname', 'name', 'field', 'fieldname', 'key', 'keyname', 'variable', 'variablename',
    'var', 'varname', 'property', 'propertyname', 'member', 'membername',
    '컬럼', '컬럼명', '칼럼', '칼럼명', '열', '열이름', '필드', '필드명', '변수', '변수명', '이름', '항목', '항목명', '키'],
  desc: ['description', 'desc', 'note', 'notes', 'comment', 'comments', 'remark', 'remarks', 'memo', 'explanation', 'summary',
    '설명', '비고', '메모', '주석', '내용', '의미', '용도'],
  type: ['type', 'datatype', 'valuetype', 'kind', '타입', '자료형', '데이터타입', '형식', '형'],
};
// Meta 시트의 타입 이름 → 툴의 열 타입. 모르는 타입은 그대로 둔다. Enum 값 목록은 열에 적힌 값이다
const TYPES = {int: 'int', integer: 'int', long: 'int', float: 'float', double: 'float', string: 'string', enum: 'enum', bool: 'bool', boolean: 'bool'};

// 설명서 표 칸 안의 | 와 줄바꿈은 이스케이프
const mdEsc = s => (s || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const mdUnesc = s => s.trim().replace(/<br>/g, '\n').replace(/\\\|/g, '|');

export class MetaDoc {
  // 설명서(.md): 프로그래머에게 넘기거나 커밋에 함께 넣는 용도
  static toMd(t) {
    const type = c => !c.id || !t.prefix ? t.typeName(c)
      : t.prefixOut ? `ID · String (\`${t.prefix}\` + 번호)` : `ID · Int (작성 시 접두사 \`${t.prefix}\`)`;
    return `# ${t.name}\n\n${t.desc ? t.desc + '\n\n' : ''}| 컬럼 | 타입 | 설명 |\n|---|---|---|\n` +
      t.cols.map(c => `| ${mdEsc(c.name)} | ${type(c)} | ${mdEsc(c.desc)} |`).join('\n') + '\n';
  }

  // toMd의 반대. 불러오기에서 같은 이름의 .md가 있으면 설명과 함께, JSON에는 없는 설정도 타입 칸에서 되살린다:
  //   열 타입(값이 비어 정수·실수를 모르는 열), ID 접두사와 'JSON에 포함', 다른 테이블 참조('items에서 가져옴')
  static applyMd(t, text) {
    const lines = text.split(/\r?\n/);
    const first = lines.findIndex(l => l.startsWith('|'));
    t.desc = (first < 0 ? lines : lines.slice(0, first)).filter(l => !l.startsWith('# ')).join('\n').trim();
    if (first < 0) return;
    // 예전 설명서의 한글 타입 이름도 읽는다
    const typeKey = {문자: 'string', 정수: 'int', 실수: 'float', '참/거짓': 'bool',
      ...Object.fromEntries(Object.entries(Table.TYPES).map(([k, v]) => [v, k]))};
    for (const l of lines.slice(first + 2)) {
      const cells = l.split(/(?<!\\)\|/).slice(1, -1).map(mdUnesc);
      const i = t.cols.findIndex(c => c.name === cells[0]);
      if (i < 0) continue;
      const col = t.cols[i], type = cells[1] || '';
      col.desc = cells[2] || '';
      let m;
      if (col.id) {
        const pre = /`([^`]*)`/.exec(type);
        if (pre && !t.prefix) t.prefix = pre[1];
        t.prefixOut = /^ID · (String|문자)/.test(type) && !!t.prefix;
      } else if ((m = /^(.+?) · (.+)에서 가져옴$/.exec(type))) {
        if (t.hasId) for (const n of m[2].split(/\s*,\s*/)) if (!t.refs.includes(n)) t.refs.push(n); // 이 열은 참조를 켜면 다시 연결된다
      } else if (/^Enum(:|$)/.test(type)) { // 'Enum: 검, 활'의 목록은 칸 값에서 다시 나온다
        if (col.type !== 'enum') t.setType(i, 'enum');
      } else if (typeKey[type] && typeKey[type] !== col.type) t.setType(i, typeKey[type]);
    }
  }

  // 설명서의 첫 표를 칸 배열로 (구분 줄 |---| 은 뺀다). 줄 끝 | 가 없는 표도 읽는다. before: 표 위의 글(테이블 설명)
  static mdTable(text) {
    const lines = text.split(/\r?\n/), isRow = l => l.trim().startsWith('|');
    const first = lines.findIndex(isRow);
    let end = first;
    while (end >= 0 && end < lines.length && isRow(lines[end])) end++;
    const before = (first < 0 ? lines : lines.slice(0, first)).filter(l => !l.startsWith('# ')).join('\n').trim();
    const rows = first < 0 ? [] : lines.slice(first, end)
      .map(l => l.trim().slice(1).replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(mdUnesc))
      .filter(r => !r.every(v => /^:?-+:?$/.test(v)));
    return {before, rows};
  }

  // 엑셀 Meta 시트(칸 배열)를 읽어 컬럼 설명과 타입을 채운다. ID 열 타입은 건드리지 않는다.
  // 머리줄을 못 찾으면 순서를 짐작하지 않고 null (설명 칸에 int가 들어가는 식으로 꼬이니까).
  // 찾으면 {missing: 테이블에 없는 컬럼 이름들}
  static readSheet(t, rows) {
    const norm = s => s.trim().toLowerCase().replace(/[\s_-]/g, '');
    const find = (head, k) => head.findIndex(h => HEAD[k].includes(norm(h)));
    // 위에 제목 줄이 있을 수 있어 처음 몇 줄 안에서 머리줄을 찾는다
    const hr = rows.slice(0, 5).findIndex(r => find(r, 'column') >= 0 && (find(r, 'desc') >= 0 || find(r, 'type') >= 0));
    if (hr < 0) return null;
    const [ci, di, ti] = ['column', 'desc', 'type'].map(k => find(rows[hr], k));
    const missing = [];
    for (const r of rows.slice(hr + 1)) {
      const name = (r[ci] || '').trim();
      if (!name) continue;
      const c = t.cols.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
      if (c < 0) { missing.push(name); continue; }
      if (di >= 0) t.cols[c].desc = (r[di] || '').trim();
      const ty = ti >= 0 && TYPES[(r[ti] || '').trim().toLowerCase()];
      if (ty && !t.cols[c].id && ty !== t.cols[c].type) t.setType(c, ty);
    }
    return {missing};
  }
}
