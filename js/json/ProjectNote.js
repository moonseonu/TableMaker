import {MetaDoc} from '../meta/MetaDoc.js';

const SITE = 'https://gametablemaker.pages.dev';

// 프로젝트 전체 zip에 함께 넣는 설정 메모 _TableMaker.md. 사람이 읽는 안내이면서, 다시 불러오면 툴이 읽어
// JSON · 설명서에는 안 남는 것(탭 순서, 행·열 바꿔 보기, ID 색 구분을 끈 것, 숨긴 경고, 직접 정한 열 너비)을 되살린다.
// 이름 앞의 _는 폴더에서 맨 위에 오고 테이블 설명서와 헷갈리지 않게
export class ProjectNote {
  static NAME = '_TableMaker.md';

  static isNote(fileName) { return fileName.split(/[\/\\]/).pop().toLowerCase() === ProjectNote.NAME.toLowerCase(); }

  // tables와 names(저장한 파일 이름, 확장자 없이)는 같은 순서
  static toMd(project, tables, names) {
    return `# ${project}\n\n` +
      `[GameTableMaker](${SITE})로 만든 게임 데이터 테이블입니다. 테이블마다 JSON(게임이 읽는 데이터)과 같은 이름의 .md(컬럼 설명)가 있습니다.\n` +
      'GameTableMaker에서 이 파일이 든 zip이나 폴더를 불러오면(불러오기 ▾ → 파일 · 폴더) 아래 순서와 설정 그대로 열립니다.\n\n' +
      '| 순서 | 테이블 | 보기 | 숨긴 경고 | 열 너비 |\n|---|---|---|---|---|\n' +
      tables.map((t, i) => {
        const widths = t.cols.filter(c => c.width).map(c => `${c.name}=${c.width}`); // 직접 정한 열 너비 (예: Line=420)
        return `| ${i + 1} | ${names[i]} | ${t.flip ? '세로' : '가로'}${t.digitColor === false ? ' · 색 구분 끔' : ''} | ${t.quiet.length ? t.quiet.join(', ') : '-'} | ${widths.length ? widths.join(', ') : '-'} |`;
      }).join('\n') + '\n';
  }

  // → [{name, flip, digitColor, quiet, widths: {컬럼 이름: px}}] (적힌 순서대로). 표를 못 찾으면 빈 배열. '열 너비' 칸이 없는 예전 메모도 읽는다
  static read(text) {
    const {rows} = MetaDoc.mdTable(text), head = rows[0] || [], at = k => head.indexOf(k);
    const [n, v, q, w] = ['테이블', '보기', '숨긴 경고', '열 너비'].map(at);
    if (n < 0) return [];
    const list = (r, i) => i >= 0 && r[i] && r[i] !== '-' ? r[i].split(/\s*,\s*/).filter(Boolean) : [];
    return rows.slice(1).filter(r => r[n]).map(r => ({
      name: r[n], flip: v >= 0 && r[v].startsWith('세로'), digitColor: !(v >= 0 && r[v].includes('색 구분 끔')), quiet: list(r, q),
      widths: Object.fromEntries(list(r, w).map(s => s.split('=')).filter(([k, px]) => k && +px > 0).map(([k, px]) => [k, +px])),
    }));
  }

  // 이번에 불러온 테이블들(added: 파일 이름 → 테이블)에 메모를 되살린다. 순서는 이번 테이블들이 차지한 탭 자리 안에서만 바꾼다
  static apply(wb, added, note) {
    const mine = [...added.values()], slots = mine.map(t => wb.tables.indexOf(t)).sort((a, b) => a - b);
    const ordered = note.map(r => added.get(r.name)).filter(Boolean);
    for (const r of note) {
      const t = added.get(r.name);
      if (!t) continue;
      Object.assign(t, {flip: r.flip, quiet: r.quiet, digitColor: r.digitColor});
      for (const c of t.cols) if (r.widths?.[c.name]) c.width = r.widths[c.name];
    }
    [...new Set([...ordered, ...mine])].forEach((t, i) => wb.tables[slots[i]] = t);
  }
}
