import {Table} from '../data/Table.js';

// 엑셀 · CSV로 내보낼 칸 배열 만들기. 기본은 첫 줄 컬럼 이름 + 값만 있는 단순한 표.
// opts (저장 창의 체크, 기본은 모두 꺼짐):
//   types: 컬럼 이름 아래에 타입 줄(int · string · enum…). 다시 불러오면 그 타입대로 읽는다(SheetText.splitTypes)
//   meta: 테이블마다 설명 표 '이름_Meta'(Column · Description · Type). 다시 불러오면 설명으로 붙는다(MetaDoc.readSheet)
//   prefix: ID에 접두사를 붙여(item_1001) 글자로
// 값은 엑셀 칸 종류에 맞춰 넘긴다: 숫자 열은 숫자, Bool 열은 참 · 거짓, 나머지는 글자 (CSV는 모두 글자)
export class SheetExport {
  static rows(t, {types, prefix} = {}) {
    const pre = prefix && t.prefix;
    const typeWord = c => c.id ? (pre ? 'string' : 'int') : c.type;
    const body = t.rows.map(r => t.cols.map((c, i) => SheetExport.cell(c.id && pre && r[i] !== '' ? t.prefix + r[i] : r[i], c.id ? (pre ? 'string' : 'int') : c.type)));
    return [t.cols.map(c => c.name), ...(types ? [t.cols.map(typeWord)] : []), ...body];
  }

  // 칸 값 하나 → 엑셀에 넣을 값 (적힌 글자가 그 타입에 맞을 때만 숫자 · 참거짓으로, 아니면 글자 그대로)
  static cell(v, type) {
    if (v === '') return '';
    if ((type === 'int' || type === 'float') && Table.valid(v, type)) return Number(v);
    if (type === 'bool' && (v === 'true' || v === 'false')) return v === 'true';
    return v;
  }

  static metaRows(t, {prefix} = {}) {
    return [['Column', 'Description', 'Type'], ...t.cols.map(c => [c.name, c.desc || '', c.id ? (prefix && t.prefix ? 'String' : 'Int') : Table.TYPES[c.type]])];
  }

  // 칸 배열 → CSV 글자 (쉼표 · 따옴표 · 줄바꿈이 든 칸은 따옴표로 감싼다). 엑셀에서 한글이 깨지지 않게 맨 앞에 BOM
  static csv(rows) {
    const q = v => { const s = String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }
}
