import {unComma} from '../common/util.js';
import {Table} from '../data/Table.js';

// 시트의 타입 줄에 쓰이는 이름 → 툴의 열 타입 (C#·엑셀에서 흔히 쓰는 이름들, 대소문자 무시)
const TYPE_WORDS = {
  int: 'int', integer: 'int', long: 'int', short: 'int', byte: 'int', uint: 'int', ulong: 'int',
  float: 'float', double: 'float', decimal: 'float', number: 'float',
  string: 'string', str: 'string', text: 'string', char: 'string',
  bool: 'bool', boolean: 'bool', enum: 'enum', id: 'id',
};

// 바깥에서 들어오는 표 글자를 읽는다: CSV 파일(쉼표), 엑셀·구글 시트에서 복사한 표(탭)
export class SheetText {
  // 글자 → 칸 배열. 따옴표는 칸 맨 앞에서만 시작한다 (칸 안의 줄바꿈·구분자용)
  static rows(text, sep) {
    const rows = [[]];
    let f = '', q = false;
    text = text.replace(/\r\n?/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch !== '"') f += ch;
        else if (text[i + 1] === '"') { f += '"'; i++; }
        else q = false;
      } else if (ch === '"' && f === '') q = true;
      else if (ch === sep) { rows.at(-1).push(f); f = ''; }
      else if (ch === '\n') { rows.at(-1).push(f); f = ''; rows.push([]); }
      else f += ch;
    }
    rows.at(-1).push(f);
    if (rows.length > 1 && rows.at(-1).every(v => v === '')) rows.pop(); // 엑셀은 끝에 줄바꿈을 붙인다
    return rows;
  }

  // 칸 배열 → 객체 배열. 첫 줄이 컬럼 이름. 값은 숫자·참거짓을 알아보고 넘긴 뒤 Table.fromData가 열 타입을 정한다
  // types: 타입 줄에 String·Enum으로 적힌 열은 숫자처럼 보여도 글자 그대로 둔다 (007이 7이 되지 않게)
  static toList(rows, types = {}) {
    const [head, ...body] = rows.filter(r => r.some(v => v !== ''));
    if (!head) throw new Error('빈 표입니다');
    const keys = head.map(h => h.trim());
    const val = (v, k) => v === '' ? null : types[k] === 'string' || types[k] === 'enum' ? v
      : (v = unComma(v)) === '' ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : /^(true|false)$/i.test(v) ? v.toLowerCase() === 'true' : v;
    return body.map(r => Object.fromEntries(keys.map((k, i) => [k, val(r[i] ?? '', k)])));
  }

  // 칸 배열(첫 줄이 컬럼 이름) → 테이블. 시트에 타입 줄이 있으면 그 타입대로 (엑셀 시트 · CSV · 붙여넣은 표 모두)
  static toTable(rows, name) {
    const {rows: body, types} = SheetText.splitTypes(rows);
    return Table.fromData(SheetText.toList(body, types), name, types);
  }

  // 시트에 따로 적어 둔 타입 줄 (게임 데이터 엑셀에 흔한 '1행 이름, 2행 int · string…', 또는 타입 줄이 이름 위).
  // 컬럼 이름 바로 아래나 바로 위 줄의 칸이 모두 타입 이름이면 그 줄을 타입으로 쓰고 데이터에서는 뺀다.
  // 칸 하나라도 타입 이름이 아니면 보통 데이터 줄로 본다 → {rows: 타입 줄을 뺀 칸 배열, types: {컬럼 이름: 타입}}
  static splitTypes(rows) {
    const live = rows.filter(r => r.some(v => v !== '')), word = v => TYPE_WORDS[v.trim().toLowerCase()];
    const isTypes = r => !!r && r.filter(v => v.trim()).length >= 2 && r.every(v => !v.trim() || word(v));
    let head = live[0], body = live.slice(1), typeRow = null;
    if (isTypes(live[0]) && live[1]) [typeRow, head, body] = [live[0], live[1], live.slice(2)];
    else if (isTypes(live[1])) [typeRow, body] = [live[1], live.slice(2)];
    const types = {};
    if (typeRow) head.forEach((h, i) => { if (h.trim() && word(typeRow[i] || '')) types[h.trim()] = word(typeRow[i]); });
    return {rows: head ? [head, ...body] : [], types};
  }

  static csvTable(text, name) { return SheetText.toTable(SheetText.rows(text, ','), name); }

  // 한국어 엑셀이 저장한 CSV는 UTF-8이 아니라 EUC-KR인 경우가 많다
  static decode(bytes) {
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch { return new TextDecoder('euc-kr').decode(bytes); }
  }
}
