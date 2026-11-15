import {Zip} from '../common/Zip.js';

// 엑셀(.xlsx) 만들기 (외부 라이브러리 없이). xlsx는 XML 파일 몇 개를 묶은 zip이라 Zip.create로 묶는다.
// 꾸밈(글꼴 · 색 · 너비)은 넣지 않는다. 글자는 시트 안에 바로(inlineStr), 숫자는 숫자 칸, true · false는 참거짓 칸으로.
// 읽기는 import/Xlsx.js
const esc = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

export class XlsxWriter {
  // sheets: [{name, rows: 칸 배열(글자 · 숫자 · true/false)}] → Blob
  static create(sheets) {
    const names = XlsxWriter.names(sheets.map(s => s.name));
    const files = [
      {name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
        '</Types>'},
      {name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'},
      {name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        '</Relationships>'},
      ...sheets.map((s, i) => ({name: `xl/worksheets/sheet${i + 1}.xml`, text: XlsxWriter.sheet(s.rows)})),
    ];
    return Zip.create(files);
  }

  static sheet(rows) {
    const cell = (v, ref) => v === '' || v == null ? ''
      : typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>`
      : typeof v === 'boolean' ? `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(v, colName(ci) + (ri + 1))).join('')}</row>`).join('') +
      '</sheetData></worksheet>';
  }

  // 엑셀 시트 이름 규칙: 31자까지, \ / ? * [ ] : 는 못 쓰고, 대소문자만 다른 이름도 겹친다
  static names(list) {
    const used = new Set();
    return list.map(n => {
      let base = (n || 'Sheet').replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Sheet', out = base;
      for (let k = 2; used.has(out.toLowerCase()); k++) out = base.slice(0, 31 - String(k).length - 1) + '_' + k;
      used.add(out.toLowerCase());
      return out;
    });
  }
}
