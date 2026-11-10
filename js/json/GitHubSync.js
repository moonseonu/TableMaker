import {$, esc} from '../common/util.js';
import {GITHUB_API} from '../settings/GitHubAccount.js';
import {ImportPlan} from '../import/ImportPlan.js';
import {ProjectNote} from './ProjectNote.js';
import {blobSha} from './GitHubCommit.js';
import {descName, tableOf} from './DescName.js';
import {SyncPicker} from './SyncPicker.js';

const OPENS = /\.(json|csv|md)$/i;
const enc = p => p.split('/').map(encodeURIComponent).join('/');
const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};

// 프로젝트 ↔ GitHub 저장소 폴더 연결 (팀원끼리 같은 데이터 보기).
// GitHub에서 불러오거나 GitHub에 커밋하면 지금 프로젝트가 저장소 · 브랜치 · 폴더와, 그때 맞춘 커밋, 그리고 파일마다 두 가지 번호를 기억한다:
//   files: 그때 GitHub에 있던 파일의 git 번호 (GitHub 쪽이 바뀌었나), local: 그때 이 툴이 만들어 낸 파일의 번호 (내가 고쳤나).
//   이 툴은 설명서를 자기 형식으로 다시 써서, 내가 안 고쳐도 GitHub 파일과 글자가 다를 수 있어 둘을 따로 둔다
// (Projects 목록에 link로. 되돌리기 기록에 섞이지 않게 탭 묶음과는 따로).
// 연결된 프로젝트는 탭 줄 오른쪽 고정 칸에 ↻: 누르면 GitHub을 확인해 받을 것을 목록으로 보여 주고, 고른 파일로 같은 탭을 새 내용으로 바꾼다(새 테이블은 탭으로 더한다).
// 열 때 · 탭으로 돌아올 때 · 보는 동안 1분마다 브랜치 끝 커밋을 확인한다. 조건부 요청이라 안 바뀌었으면 304(한도에 안 셈).
// 새 커밋이 있으면 ↻에 점, 위에 '○○님이 새로 저장했어요 · [갱신하기]' 띠.
// ↻를 누르면 받을 목록 창(SyncPicker: 신규 · 수정)에서 고른 파일만 받는다. 내 변경도 있는 파일은 ⚠ 체크를 빼 둔다.
// GitHub에서만 지운 파일은 여기서 탭을 지우지 않는다(여기가 원본. 다음 커밋 때 새 파일로 다시 올라간다).
// 여기서 지운 탭은 GitHubCommit이 다음 커밋에 '삭제'로 올린다.
// ponytail: 폴더 바로 아래 파일만 맞춘다(하위 폴더는 불러오기로)
export class GitHubSync {
  constructor(app) {
    this.app = app;
    this.latest = null; // 마지막으로 확인한 브랜치 끝 커밋
    this.etag = null;
    app.tabs.tools.addEventListener('click', e => { if (e.target.closest('#ghSync')) this.sync(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
    setInterval(() => { if (!document.hidden) this.check(); }, 60000);
    app.githubAccount.ready.then(() => this.check());
  }

  get link() { return this.app.projects.current.link; }

  setLink(link) {
    this.app.projects.current.link = link;
    this.app.projects.save();
    this.latest = null;
    this.etag = null;
    this.app.tabs.render();
    this.mark();
  }

  // GitHub 쪽에 새 커밋이 있나 (↻의 점, 띠)
  get fresh() { return !!(this.link && this.latest && this.latest.sha !== this.link.sha && this.latestKey === this.key); }

  get key() { const l = this.link; return l && `${l.owner}/${l.repo}@${l.branch}`; }

  tip() {
    const l = this.link;
    if (!l) return '';
    return `GitHub에서 갱신 · ${l.owner}/${l.repo}${l.path ? ` · ${l.path}` : ''} (${l.branch})\n마지막으로 맞춘 때: ${ago(l.at)}` +
      (this.fresh ? '\n● 새 커밋이 있습니다' : '');
  }

  // 브랜치 끝 커밋 (fresh: 조건부 요청 없이 새로)
  async head(l, fresh) {
    const headers = await this.app.githubAccount.headers();
    if (!fresh && this.etag && this.latestKey === this.key) headers['If-None-Match'] = this.etag;
    const res = await fetch(`${GITHUB_API}/repos/${l.owner}/${l.repo}/commits/${encodeURIComponent(l.branch)}`, {headers, cache: 'no-store'});
    if (res.status === 304) return this.latest;
    if (!res.ok) throw new Error(`GitHub 오류 ${res.status}`);
    this.etag = res.headers.get('etag');
    this.latestKey = this.key;
    return this.latest = await res.json();
  }

  // 브랜치 끝이 움직였어도 연결된 폴더의 파일이 그대로면(코드만 바꾼 커밋, 브랜치 합치기 등) 알림 없이 '맞춤'으로 기록한다.
  // 폴더 파일이 바뀌었거나 새로 생겼을 때만(= ↻가 실제로 받을 것이 있을 때만) ↻의 점과 띠를 띄운다.
  // 폴더 목록은 브랜치 끝이 새 커밋일 때 한 번만 받는다 (평소 확인은 조건부 요청이라 한도에 안 셈)
  async check() {
    const l = this.link;
    if (!l) return this.mark();
    try {
      await this.head(l);
      if (this.fresh && this.latest.sha !== this.looked) {
        this.looked = this.latest.sha;
        const {tree} = await this.app.github.tree(l.owner, l.repo, l.branch, true);
        const remote = this.remoteFiles(tree, l.path);
        if (!Object.keys(remote).some(n => remote[n] !== l.files[n])) {
          const {latest, etag} = this;
          this.setLink({...l, sha: latest.sha});
          Object.assign(this, {latest, etag, latestKey: this.key}); // 다음 확인도 조건부 요청으로
        }
      }
    } catch {} // 오프라인 등: 알림만 못 띄운다
    this.mark();
  }

  // ↻의 점과 알림 띠를 지금 상태로
  mark() {
    const btn = $('ghSync');
    if (btn) { btn.classList.toggle('new', this.fresh); btn.title = this.tip(); }
    let bar = document.querySelector('.ghbar');
    if (!this.fresh || this.closed === this.latest.sha) { bar?.remove(); return; }
    if (!bar) {
      bar = Object.assign(document.createElement('div'), {className: 'ghbar'});
      bar.onclick = e => {
        if (e.target.closest('[data-sync]')) this.sync();
        else if (e.target.closest('[data-close]')) { this.closed = this.latest.sha; bar.remove(); } // 이 커밋은 다시 띄우지 않는다 (↻의 점은 남음)
      };
      $('tabs').before(bar);
    }
    const c = this.latest, who = c.author?.login || c.commit?.author?.name || '누군가', msg = (c.commit?.message || '').split('\n')[0];
    bar.innerHTML = `<span><b>${esc(who)}</b>님이 GitHub에 새로 저장했어요 · <span class="dim">${esc(msg)}</span></span>` +
      '<button data-sync class="primary">갱신하기</button><button data-close class="ico" title="닫기 (↻로 언제든 갱신할 수 있습니다)">✕</button>';
  }

  // 연결 만들기 · 다시 맞추기: 지금 GitHub 브랜치 끝과 폴더 바로 아래 파일들의 번호를 기억한다
  async relink(owner, repo, branch, path) {
    const l = {owner, repo, branch, path};
    const head = await this.head(l, true);
    const {tree} = await this.app.github.tree(owner, repo, branch, true);
    this.setLink({...l, sha: head.sha, at: Date.now(), files: this.remoteFiles(tree, path), local: await this.localShas()});
  }

  // 불러오기 창의 '현재 표로 연동': 탭은 그대로 두고 연결만 한다(파일을 고르지 않아 중복 탭이 생기지 않는다).
  // 이름이 같은 파일은 GitHub 것을 '맞춘 것'으로 기억해서, 내용이 다르면 '내가 고친 것'이 돼 다음 커밋 목록에 나온다.
  // GitHub에만 있는 파일은 기억하지 않아서 바로 이어지는 갱신(↻와 같다)으로 받는다
  async linkHere(owner, repo, branch, path, tree, empty) {
    const head = empty ? null : await this.head({owner, repo, branch}, true);
    const remote = this.remoteFiles(tree, path), mine = await this.localShas();
    const both = Object.fromEntries(Object.entries(remote).filter(([n]) => n in mine));
    const ups = Object.keys(mine).filter(n => mine[n] !== remote[n]).length, news = Object.keys(remote).filter(n => !(n in mine)).length;
    this.setLink({owner, repo, branch, path, sha: head?.sha || null, at: Date.now(), files: both, local: {...both}});
    const got = news && await this.sync();
    this.app.toast(`${owner}/${repo}${path ? ` · ${path}` : ''}에 연동했습니다 · 지금 표는 그대로입니다` +
      (news ? got ? `\nGitHub에만 있던 파일 ${news}개를 받았습니다` : '\nGitHub에만 있던 파일은 못 받았습니다 · ↻로 다시 받으세요' : '') +
      (ups ? `\n올릴 변경 ${ups}개 · 파일 저장 ▾ → GitHub에 커밋으로 올리세요` : ''), news && !got ? 'warn' : '');
  }

  // 지금 탭들로 만든 파일들(프로젝트 전체 저장과 같은 것) → {파일 이름: git 번호}. names를 주면 그 파일만
  async localShas(names) {
    const out = {};
    for (const f of this.app.exporter.projectFiles()) if (!names || names.has(f.name)) out[f.name] = await blobSha(f.text);
    return out;
  }

  // 폴더 바로 아래의 JSON · CSV · 설명서 → {파일 이름: git 파일 번호}
  remoteFiles(tree, path) {
    const pre = path ? path + '/' : '', out = {};
    for (const n of tree) {
      const rel = n.path.slice(pre.length);
      if (n.type === 'blob' && n.path.startsWith(pre) && !rel.includes('/') && OPENS.test(rel)) out[rel] = n.sha;
    }
    return out;
  }

  // 받을 목록을 만들어 창(SyncPicker)에서 고르게 하고, 고른 파일만 받는다.
  // all: 불러오기의 '갱신하기'에서. 여기서 지운 테이블만 있어도 창을 띄운다(↻는 '이미 최신')
  async sync(all = false) {
    const l = this.link, wb = this.app.workbook, gh = this.app.githubAccount;
    if (!l || this.busy) return;
    const btn = $('ghSync');
    this.busy = true;
    btn?.classList.add('busy');
    try {
      const head = await this.head(l, true);
      const {tree} = await this.app.github.tree(l.owner, l.repo, l.branch, true);
      const remote = this.remoteFiles(tree, l.path), pre = l.path ? l.path + '/' : '';
      const now = await this.localShas(), was = l.local || {}, base = tableOf; // base: 파일 이름 → 테이블 이름 (설명서의 _Desc도 뗀다)
      const rows = this.plan(remote, now, was);
      if (!rows.some(r => all || !r.gone)) {
        this.setLink({...l, sha: head.sha, at: Date.now()});
        return this.app.toast('이미 최신입니다');
      }
      const pick = await SyncPicker.show(l, head, rows, ago);
      if (!pick) return;
      // 받을 파일: 고른 것 + 고른 테이블의 설명서(테이블을 새로 만들면 설명을 다시 붙여야 해서). 목록에서 체크를 뺀 설명서는 빼고
      const want = new Set(pick), off = new Set(rows.filter(r => !pick.has(r.name)).map(r => r.name));
      for (const n of pick) if (/\.(json|csv)$/i.test(n)) for (const md of [descName(base(n)), base(n) + '.md']) if (remote[md] && !off.has(md)) want.add(md); // 새 이름 · 예전 이름 설명서
      const files = [...want].map(n => ({name: n, webkitRelativePath: `${l.repo}/${n}`, size: 0,
        arrayBuffer: async () => (await (gh.loggedIn
          ? gh.req(`${GITHUB_API}/repos/${l.owner}/${l.repo}/contents/${enc(pre + n)}?ref=${encodeURIComponent(l.branch)}`, true)
          : gh.req(`https://raw.githubusercontent.com/${l.owner}/${l.repo}/${enc(l.branch)}/${enc(pre + n)}`))).arrayBuffer()}));
      const errors = [], items = await ImportPlan.read(files, true, errors);
      const done = this.apply(items, errors);
      // 안 받은 파일은 예전 번호로 둬서 다음에도 목록에 나온다
      const kept = Object.fromEntries([...off].map(n => [n, l.files[n]]));
      this.app.show(wb.cur);
      // 받은 파일은 '맞춤'으로: 그 테이블의 JSON · 설명서와 설정 메모를 지금 만들어 내는 대로 다시 기억한다
      const fresh = new Set([...want].flatMap(n => ProjectNote.isNote(n) ? [n] : [base(n) + '.json', descName(base(n)), base(n) + '.md', base(n) + '.csv']));
      fresh.add(ProjectNote.NAME);
      this.setLink({...l, sha: head.sha, at: Date.now(), files: {...remote, ...kept}, local: {...was, ...await this.localShas(fresh)}});
      const problems = errors.length ? '\n' + errors.join('\n') : '';
      this.app.toast(`GitHub에서 갱신했습니다 · ${done}${problems}`, errors.length ? 'warn' : '');
      return true;
    } catch (err) {
      this.app.toast('GitHub에서 갱신 실패\n' + err.message, 'bad');
    } finally {
      this.busy = false;
      $('ghSync')?.classList.remove('busy');
    }
  }

  // 갱신 창의 목록. 상태는 GitHub 쪽에서 본 것:
  //   신규: GitHub에는 있고 여기에 탭이 없는 테이블(연결 기록이 아니라 탭으로 가려서, 처음 불러올 때 안 고른 것도 나온다) — 체크.
  //     여기서 지운 테이블(gone)이면 체크 뺌(안 받으면 다음 커밋에 GitHub에서도 지운다)
  //   수정: GitHub에서 바뀐 파일 — 체크. 아직 커밋하지 않은 내 변경도 있으면 ⚠ 체크 뺌
  // 탭이 없는 테이블의 설명서는 목록에 따로 넣지 않고 테이블을 받을 때 함께 받는다
  plan(remote, now, was) {
    const l = this.link, wb = this.app.workbook, rows = [];
    const mine = n => n in now && now[n] !== (n in was ? was[n] : remote[n]);
    for (const n of Object.keys(remote).sort()) {
      const tab = ProjectNote.isNote(n) || wb.findByName(tableOf(n));
      if (!tab) {
        if (!/\.(json|csv)$/i.test(n)) continue;
        const gone = n in was;
        rows.push({name: n, kind: 'new', on: !gone, gone, tip: gone ? '여기서 지운 테이블입니다. 받으면 되살리고, 안 받으면 다음 커밋에 GitHub에서도 지웁니다' : ''});
      } else if (remote[n] !== l.files[n]) {
        const risky = mine(n);
        rows.push({name: n, kind: 'mod', on: !risky, risky});
      }
    }
    return rows.sort((a, b) => (a.kind === 'mod') - (b.kind === 'mod') || a.gone - b.gone);
  }

  // 받은 것을 이름이 같은 탭에: 테이블은 내용을 바꾸고(보기 · 숨긴 경고는 그대로, 설정 메모가 있으면 그것대로), 없으면 새 탭으로.
  // 설명은 짐작한 테이블에 다시 붙인다(불러오기와 같은 짐작, ImportPlan.classify)
  apply(items, errors) {
    const wb = this.app.workbook, plan = ImportPlan.classify(items, wb), touched = new Map(), made = new Map();
    let tables = 0, metas = 0;
    for (const it of items.filter(it => it.dest === 'new' && it.on)) {
      try {
        const t = ImportPlan.toTable(it, it.base), old = wb.findByName(it.base);
        if (old) { Object.assign(t, {flip: old.flip, quiet: old.quiet, digitColor: old.digitColor, locked: old.locked}); wb.tables[wb.tables.indexOf(old)] = t; }
        else wb.add(t);
        made.set(it, t);
        touched.set(it.base, t);
        tables++;
      } catch (err) { errors.push(`${it.label}: ${err.message}`); }
    }
    for (const it of items.filter(it => /^t\d+$/.test(it.dest) && it.on)) {
      const to = plan.targets[+it.dest.slice(1)], t = to.item ? made.get(to.item) : wb.findByName(to.tab.name);
      if (t && ImportPlan.asMeta(it, t)) metas++;
    }
    const note = items.find(it => it.note);
    if (note && touched.size) ProjectNote.apply(wb, touched, ProjectNote.read(note.text));
    return [tables && `테이블 ${tables}개`, metas && `설명 ${metas}개`, note && '설정'].filter(Boolean).join(' · ') || '바뀐 내용 없음';
  }
}
