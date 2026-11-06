import {$, esc, ask} from '../common/util.js';
import {GITHUB_API} from '../settings/GitHubAccount.js';
import {ImportPlan} from '../import/ImportPlan.js';
import {ProjectNote} from './ProjectNote.js';
import {blobSha} from './GitHubCommit.js';

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
// 연결된 프로젝트는 탭 줄 맨 앞에 ↻: 누르면 바로 GitHub을 확인해 바뀐 파일만 받아 같은 탭을 새 내용으로 바꾼다(새 테이블은 탭으로 더한다).
// 열 때 · 탭으로 돌아올 때 · 보는 동안 1분마다 브랜치 끝 커밋을 확인한다. 조건부 요청이라 안 바뀌었으면 304(한도에 안 셈).
// 새 커밋이 있으면 ↻에 점, 위에 '○○님이 새로 저장했어요 · [갱신하기]' 띠.
// 내가 커밋하지 않은 변경이 있는 탭을 GitHub 것이 덮게 되면 확인 팝업으로 묻는다.
// GitHub에서만 지운 파일은 여기서 탭을 지우지 않는다(여기가 원본. 다음 커밋 때 새 파일로 다시 올라간다).
// 여기서 지운 탭은 GitHubCommit이 다음 커밋에 '삭제'로 올린다.
// ponytail: 폴더 바로 아래 파일만 맞춘다(하위 폴더는 불러오기로)
export class GitHubSync {
  constructor(app) {
    this.app = app;
    this.latest = null; // 마지막으로 확인한 브랜치 끝 커밋
    this.etag = null;
    app.tabs.el.addEventListener('click', e => { if (e.target.closest('#ghSync')) this.sync(); });
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

  async check() {
    if (!this.link) return this.mark();
    try { await this.head(this.link); } catch {} // 오프라인 등: 알림만 못 띄운다
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

  async sync() {
    const l = this.link, wb = this.app.workbook, gh = this.app.githubAccount;
    if (!l || this.busy) return;
    const btn = $('ghSync');
    this.busy = true;
    btn?.classList.add('busy');
    try {
      const head = await this.head(l, true);
      const {tree} = await this.app.github.tree(l.owner, l.repo, l.branch, true);
      const remote = this.remoteFiles(tree, l.path), pre = l.path ? l.path + '/' : '';
      const changed = Object.keys(remote).filter(n => remote[n] !== l.files[n]);
      if (!changed.length) {
        this.setLink({...l, sha: head.sha, at: Date.now()});
        return this.app.toast('이미 최신입니다');
      }
      // 내가 커밋하지 않은 변경: 지금 탭에서 만든 파일이 마지막으로 맞춘 때 만들던 것과 다르다
      const now = await this.localShas(), was = l.local || {};
      const mine = changed.filter(n => n in now && n in was && now[n] !== was[n]);
      const base = n => n.replace(/\.[^.]+$/, '');
      let skip = new Set();
      if (mine.length) {
        const tabs = [...new Set(mine.filter(n => !ProjectNote.isNote(n)).map(base))];
        const over = await ask('아직 커밋하지 않은 내 변경이 있습니다',
          `${tabs.length ? tabs.join(', ') : '탭 순서 · 보기 설정'}에 GitHub에 올리지 않은 변경이 있는데, GitHub에도 새 내용이 있습니다. GitHub 것으로 덮어쓸까요? (Ctrl+Z로 되돌릴 수 있습니다)`,
          '덮어쓰기', 'warn', '그 탭은 두기');
        if (!over) skip = new Set(mine);
      }
      // 받을 파일: 바뀐 것 + 바뀐 테이블의 설명서(테이블을 새로 만들면 설명을 다시 붙여야 해서)
      const want = new Set(changed.filter(n => !skip.has(n)));
      for (const n of [...want]) if (/\.(json|csv)$/i.test(n) && remote[base(n) + '.md'] && !skip.has(base(n) + '.md')) want.add(base(n) + '.md');
      const files = [...want].map(n => ({name: n, webkitRelativePath: `${l.repo}/${n}`, size: 0,
        arrayBuffer: async () => (await (gh.loggedIn
          ? gh.req(`${GITHUB_API}/repos/${l.owner}/${l.repo}/contents/${enc(pre + n)}?ref=${encodeURIComponent(l.branch)}`, true)
          : gh.req(`https://raw.githubusercontent.com/${l.owner}/${l.repo}/${enc(l.branch)}/${enc(pre + n)}`))).arrayBuffer()}));
      const errors = [], items = await ImportPlan.read(files, true, errors);
      const done = this.apply(items, errors);
      // 덮어쓰지 않은 파일은 예전 번호로 둬서 다음에도 '바뀜'으로 남는다
      const kept = Object.fromEntries([...skip].map(n => [n, l.files[n]]));
      this.app.show(wb.cur);
      // 받은 파일은 '맞춤'으로: 그 테이블의 JSON · 설명서와 설정 메모를 지금 만들어 내는 대로 다시 기억한다
      const fresh = new Set([...want].flatMap(n => ProjectNote.isNote(n) ? [n] : [base(n) + '.json', base(n) + '.md', base(n) + '.csv']));
      fresh.add(ProjectNote.NAME);
      this.setLink({...l, sha: head.sha, at: Date.now(), files: {...remote, ...kept}, local: {...was, ...await this.localShas(fresh)}});
      const problems = errors.length ? '\n' + errors.join('\n') : '';
      this.app.toast(`GitHub에서 갱신했습니다 · ${done}${skip.size ? `\n그대로 둔 것: ${[...new Set([...skip].map(base))].join(', ')}` : ''}${problems}`, errors.length ? 'warn' : '');
      return true;
    } catch (err) {
      this.app.toast('GitHub에서 갱신 실패\n' + err.message, 'bad');
    } finally {
      this.busy = false;
      $('ghSync')?.classList.remove('busy');
    }
  }

  // 받은 것을 이름이 같은 탭에: 테이블은 내용을 바꾸고(보기 · 숨긴 경고는 그대로, 설정 메모가 있으면 그것대로), 없으면 새 탭으로.
  // 설명은 짐작한 테이블에 다시 붙인다(불러오기와 같은 짐작, ImportPlan.classify)
  apply(items, errors) {
    const wb = this.app.workbook, plan = ImportPlan.classify(items, wb), touched = new Map(), made = new Map();
    let tables = 0, metas = 0;
    for (const it of items.filter(it => it.dest === 'new' && it.on)) {
      try {
        const t = ImportPlan.toTable(it, it.base), old = wb.findByName(it.base);
        if (old) { Object.assign(t, {flip: old.flip, quiet: old.quiet, digitColor: old.digitColor}); wb.tables[wb.tables.indexOf(old)] = t; }
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
