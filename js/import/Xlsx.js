import {Zip} from '../common/Zip.js';

const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// 엑셀(.xlsx) 읽기 (외부 라이브러리 없이). xlsx는 zip 안에 든 XML이라 Zip으로 풀고 DOMParser로 읽는다.
// 시트마다 칸 값(글자)의 2차원 배열을 돌려준다. 수식 칸은 엑셀이 저장해 둔 계산 결과를 쓴다
export class Xlsx {
  // blob → [{name, rows}] (엑셀 탭 순서)
  static async read(blob) {
    const files = new Map((await Zip.read(blob)).map(f => [f.name, f.bytes]));
    const xml = name => files.has(name) ? new DOMParser().parseFromString(new TextDecoder().decode(files.get(name)), 'application/xml') : null;
    const book = xml('xl/workbook.xml');
    if (!book) throw new Error('엑셀(.xlsx) 파일이 아닙니다');
    // 글자 칸은 값 대신 sharedStrings의 번호가 들어 있다. 일본어 읽는 법(rPh)은 빼고 이어 붙인다
    const shared = [...(xml('xl/sharedStrings.xml')?.getElementsByTagName('si') || [])]
      .map(si => [...si.getElementsByTagName('t')].filter(t => t.parentNode.nodeName !== 'rPh').map(t => t.textContent).join(''));
    const rels = new Map([...xml('xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship')]
      .map(r => [r.getAttribute('Id'), r.getAttribute('Target')]));
    return [...book.getElementsByTagName('sheet')].map(s => {
      const target = rels.get(s.getAttributeNS(REL_NS, 'id')) || '';
      const sheet = xml(target.startsWith('/') ? target.slice(1) : 'xl/' + target);
      return {name: s.getAttribute('name'), rows: sheet ? Xlsx.rows(sheet, shared) : []};
    });
  }

  // 시트 XML → 칸 배열. 빈 칸은 XML에 없거나 값 없이 서식만 있어서, 칸 주소(B3)로 자리를 잡고 끝의 빈 줄·빈 칸은 자른다
  static rows(sheet, shared) {
    const rows = [];
    let ri = -1;
    for (const row of sheet.getElementsByTagName('row')) {
      ri = row.hasAttribute('r') ? +row.getAttribute('r') - 1 : ri + 1;
      const cells = rows[ri] = [];
      let ci = -1;
      for (const c of row.getElementsByTagName('c')) {
        const ref = /^([A-Z]+)/.exec(c.getAttribute('r') || '');
        ci = ref ? [...ref[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : ci + 1;
        cells[ci] = Xlsx.value(c, shared);
      }
    }
    const out = Array.from(rows, r => Array.from(r || [], v => v ?? ''));
    out.forEach(r => { while (r.length && r.at(-1) === '') r.pop(); });
    while (out.length && !out.at(-1).length) out.pop();
    const width = Math.max(0, ...out.map(r => r.length));
    return out.map(r => r.concat(Array(width - r.length).fill('')));
  }

  static value(c, shared) {
    const v = c.getElementsByTagName('v')[0]?.textContent ?? '', t = c.getAttribute('t');
    if (t === 's') return shared[+v] ?? '';
    if (t === 'b') return v === '1' ? 'true' : 'false';
    if (t === 'inlineStr') return [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
    if (t === 'e') return ''; // #N/A 같은 오류 값
    if (t === 'str') return v;
    // 숫자: 엑셀은 0.1을 0.10000000000000001처럼 17자리로 저장할 때가 있어 짧은 모양으로 바꾼다
    return v !== '' && isFinite(v) ? String(Number(v)) : v;
  }
}
