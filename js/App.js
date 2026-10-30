import {$} from './common/util.js';
import {Workbook} from './data/Workbook.js';
import {GridView} from './table/GridView.js';
import {TabsView} from './table/TabsView.js';
import {JsonPanel} from './json/JsonPanel.js';
import {Exporter} from './json/Exporter.js';
import {MetaPanel} from './meta/MetaPanel.js';
import {Importer} from './import/Importer.js';
import {SheetText} from './import/SheetText.js';

// 각 영역을 만들고 서로 잇는다. 영역끼리는 직접 부르지 않고 App을 거친다
//   table/  테이블 작성 영역 (표, 탭)      json/   JSON 보기·다운로드
//   meta/   테이블 설명 · 설명서          import/ 불러오기 · 붙여넣기 해석
//   data/   데이터와 규칙 (화면과 무관)
export class App {
  constructor() {
    this.workbook = Workbook.load();
    this.errors = 0;
    this.grid = new GridView($('grid'), this);
    this.tabs = new TabsView($('tabs'), this);
    this.json = new JsonPanel(this);
    this.meta = new MetaPanel(this);
    this.exporter = new Exporter(this);
    this.importer = new Importer(this);
    document.addEventListener('paste', e => this.onPaste(e));
    // ▾, ⚙ 같은 작은 설정 창은 바깥을 누르면 닫는다
    document.addEventListener('click', e => document.querySelectorAll('details[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
    this.show(this.workbook.cur);
  }

  get table() { return this.workbook.current; }

  show(i) {
    this.workbook.cur = i;
    this.tabs.render();
    this.grid.render();
  }

  // 표가 바뀔 때마다 GridView가 부른다: 상태 줄, 미리보기, 설명 패널, 저장
  changed({errors, warns}) {
    const t = this.table;
    this.errors = errors;
    this.status(errors ? `오류 ${errors}개`
      : `${t.rows.length}행 · ${t.cols.length}열` + (warns ? ` · 다른 테이블과 자릿수 겹침 ${warns}개` : ''),
      errors ? 'bad' : warns ? 'warn' : '');
    this.json.refresh();
    this.meta.refresh();
    this.workbook.save();
  }

  status(text, cls = '') {
    $('status').textContent = text;
    $('status').className = cls;
  }

  // 하단 패널 둘은 따로 켜고 끈다. 둘 다 켜면 JSON 왼쪽, 설명 오른쪽
  layoutPanels() { $('panels').hidden = !this.json.open && !this.meta.open; }

  // 붙여넣기는 커서 위치로 갈린다: 테이블 설명 창 → Meta 시트, 표의 칸 → 그 칸부터 채우기, 아무 데도 아니면 → 새 테이블
  onPaste(e) {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const rows = SheetText.rows(text, '\t'), el = document.activeElement;
    try {
      if (this.meta.paste(rows)) { e.preventDefault(); return; }
      if (this.grid.isCell(el)) { if (this.grid.paste(rows, el)) e.preventDefault(); return; }
      if (el && el.matches('input, textarea')) return;
      e.preventDefault();
      this.importer.pasteAsTable(rows);
    } catch (err) {
      e.preventDefault();
      this.status('붙여넣기 실패: ' + err.message, 'bad');
    }
  }
}
