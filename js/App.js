import {$} from './common/util.js';
import {Toast} from './common/Toast.js';
import {Workbook} from './data/Workbook.js';
import {Projects} from './data/Projects.js';
import {History} from './data/History.js';
import {GridView} from './table/GridView.js';
import {TabsView} from './table/TabsView.js';
import {JsonPanel} from './json/JsonPanel.js';
import {Exporter} from './json/Exporter.js';
import {MetaPanel} from './meta/MetaPanel.js';
import {MetaImport} from './meta/MetaImport.js';
import {Importer} from './import/Importer.js';
import {SettingsMenu} from './settings/SettingsMenu.js';
import {UpdateCheck} from './settings/UpdateCheck.js';
import {Donate} from './settings/Donate.js';
import {ProjectMenu} from './settings/ProjectMenu.js';
import {SheetText} from './import/SheetText.js';

// 각 영역을 만들고 서로 잇는다. 영역끼리는 직접 부르지 않고 App을 거친다
//   table/  테이블 작성 영역 (표, 탭)      json/   JSON 보기·다운로드
//   meta/   테이블 설명 · 설명서          import/ 불러오기 · 붙여넣기 해석
//   data/   데이터와 규칙 (화면과 무관)        settings/ ☰ 메뉴 (화면 테마, 후원), 새 버전 알림, 제목줄 왼쪽 프로젝트 메뉴
export class App {
  constructor() {
    this.projects = Projects.load();
    this.projects.save();
    Workbook.key = Projects.key(this.projects.cur);
    this.workbook = Workbook.load();
    this.history = new History(JSON.stringify(this.workbook));
    this.group = null;     // 다음 commit을 어느 묶음으로 기록할지 (한 칸 연속 타이핑 등)
    this.restoring = false; // 되돌리는 중에는 기록하지 않는다
    this.errors = 0;
    this.grid = new GridView($('grid'), this);
    this.tabs = new TabsView($('tabs'), this);
    this.json = new JsonPanel(this);
    this.meta = new MetaPanel(this);
    this.exporter = new Exporter(this);
    this.importer = new Importer(this);
    this.metaImport = new MetaImport(this);
    this.settings = new SettingsMenu();
    this.updateCheck = new UpdateCheck();
    this.donate = new Donate();
    this.projectMenu = new ProjectMenu(this);
    if (this.projects.fresh) this.projectMenu.newProject(true); // 처음 쓰는 사람은 프로젝트 만들기 창으로 시작
    document.addEventListener('paste', e => this.onPaste(e));
    document.addEventListener('keydown', e => this.onUndoKey(e));
    // ▾, ⚙ 같은 작은 설정 창은 바깥을 누르면 닫는다
    document.addEventListener('click', e => document.querySelectorAll('details[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
    this.show(this.workbook.cur);
  }

  get table() { return this.workbook.current; }

  // 다른 프로젝트로: 지금 것을 저장하고(keep) 그 프로젝트의 탭 묶음을 불러온다 (되돌리기 기록도 그 프로젝트 것으로 새로)
  openProject(id, keep = true) {
    if (keep) this.commit();
    this.projects.cur = id;
    this.projects.save();
    Workbook.key = Projects.key(id);
    this.workbook = Workbook.load();
    this.history = new History(JSON.stringify(this.workbook));
    this.projectMenu.render();
    this.show(this.workbook.cur);
  }

  show(i) {
    this.workbook.cur = i;
    this.tabs.render();
    this.grid.render();
  }

  // 표가 바뀔 때마다 GridView가 부른다: 상태 줄, 미리보기, 설명 패널, 저장
  // 상태 줄은 알릴 게 있을 때만 보인다 (행·열 수는 표를 보면 아니까 안 적는다)
  changed({errors, warns}) {
    this.errors = errors;
    if (errors) this.status(`오류 ${errors}개`, 'bad');
    else if (warns) this.status(`경고 ${warns}개`, 'warn'); // 다른 테이블과 ID 자릿수 겹침, 참조 대상에 없는 ID (칸에 마우스를 올리면 이유)
    else this.status('');
    this.json.refresh();
    this.meta.refresh();
    this.commit(this.group);
    this.group = null;
  }

  // 저장하고 되돌리기 기록에 남긴다
  commit(group) {
    const json = JSON.stringify(this.workbook);
    if (!this.restoring) this.history.record(json, group);
    this.workbook.save(json);
  }

  // Ctrl+Z 되돌리기, Ctrl+Y · Ctrl+Shift+Z 다시 하기. 한글 자판에서도 되게 글자(key) 대신 자판 위치(code)로 본다.
  // 컬럼 이름·접두사·설명처럼 글을 쓰는 칸에서는 브라우저 기본 되돌리기(그 칸 글자만)를 그대로 둔다
  onUndoKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !['KeyZ', 'KeyY'].includes(e.code)) return;
    const t = e.target;
    if (t.closest && (t.closest('#meta') || t.closest('.tab') || t.matches('.cname, .prefix'))) return;
    e.preventDefault();
    this.undo(e.code === 'KeyY' || e.shiftKey);
  }

  undo(redo) {
    const json = redo ? this.history.redo() : this.history.undo();
    if (json == null) return this.toast(redo ? '다시 할 것이 없습니다' : '되돌릴 것이 없습니다');
    const a = document.activeElement, p = this.grid.el.contains(a) && this.grid.pos(a);
    this.restoring = true;
    this.workbook = new Workbook(JSON.parse(json));
    this.show(this.workbook.cur);
    this.restoring = false;
    const el = p && this.grid.at(p.r, p.c); // 커서는 같은 자리로
    if (el) this.grid.focusEl(el);
  }

  // 상태줄: 지금 탭의 오류·경고 수처럼 늘 보여야 하는 것
  status(text, cls = '') {
    $('status').textContent = text;
    $('status').className = cls;
  }

  // 한 번 알리면 되는 것은 잠깐 떴다 사라지는 알림으로
  toast(text, kind) { Toast.show(text, kind); }

  // 하단 패널 둘은 따로 켜고 끈다. 둘 다 켜면 JSON 왼쪽, 설명 오른쪽
  layoutPanels() { $('panels').hidden = !this.json.open && !this.meta.open; }

  // 붙여넣기는 커서 위치로 갈린다: 테이블 설명 창 → Meta 시트, 표의 칸 → 그 칸부터 채우기, 아무 데도 아니면 → 새 테이블
  onPaste(e) {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const rows = SheetText.rows(text, '\t'), el = this.grid.active(); // 스크롤로 치워진 커서 칸도 돌려놓고 붙인다
    try {
      if (this.meta.paste(rows)) { e.preventDefault(); return; }
      if (this.grid.isCell(el)) { if (this.grid.paste(rows, el)) e.preventDefault(); return; }
      if (el && el.matches('input, textarea')) return;
      e.preventDefault();
      this.importer.pasteAsTable(rows);
    } catch (err) {
      e.preventDefault();
      this.toast('붙여넣기 실패: ' + err.message, 'bad');
    }
  }
}
