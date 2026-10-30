import {unComma} from '../common/util.js';

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
  static toList(rows) {
    const [head, ...body] = rows.filter(r => r.some(v => v !== ''));
    if (!head) throw new Error('빈 표입니다');
    const keys = head.map(h => h.trim());
    const val = v => (v = unComma(v)) === '' ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v)
      : /^(true|false)$/i.test(v) ? v.toLowerCase() === 'true' : v;
    return body.map(r => Object.fromEntries(keys.map((k, i) => [k, val(r[i] ?? '')])));
  }

  static csv(text) { return SheetText.toList(SheetText.rows(text, ',')); }

  // 한국어 엑셀이 저장한 CSV는 UTF-8이 아니라 EUC-KR인 경우가 많다
  static decode(bytes) {
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch { return new TextDecoder('euc-kr').decode(bytes); }
  }
}
