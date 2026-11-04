import {MetaDoc} from './MetaDoc.js';

// 불러온 설명을 이미 있는(또는 이번에 만든) 테이블에 붙인다 (불러오기 목록 창에서 들어갈 곳이 '설명 → 탭'인 것, ImportPlan).
// 설명서(.md): 이 툴이 만든 것(컬럼 | 타입 | 설명)은 ID 접두사·참조·Enum까지 되살리고(MetaDoc.applyMd),
// 다른 데서 만든 것은 엑셀 Meta 시트처럼 머리줄 이름으로 열을 찾아 설명과 타입만 읽는다(MetaDoc.readSheet).
// 표 형식 Meta(JSON · CSV · 엑셀 시트)는 칸 배열 그대로 readSheet.
// 둘 다 붙였으면 테이블에 없는 컬럼 이름들, 표 머리줄을 못 찾으면 null
export class MetaImport {
  static applyMd(t, text) {
    const {before, rows} = MetaDoc.mdTable(text);
    if (rows[0] && rows[0].slice(0, 3).join('|') === '컬럼|타입|설명') {
      MetaDoc.applyMd(t, text);
      return rows.slice(1).map(r => r[0]).filter(n => n && !t.cols.some(c => c.name === n));
    }
    const res = MetaDoc.readSheet(t, rows);
    if (!res) return null;
    if (before) t.desc = before;
    return res.missing;
  }

  static applyRows(t, rows) {
    const res = MetaDoc.readSheet(t, rows);
    return res && res.missing;
  }
}
