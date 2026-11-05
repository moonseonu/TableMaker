import {$, esc, ask, askText} from '../common/util.js';
import {GITHUB_API} from '../settings/GitHubAccount.js';
import {Combo} from '../common/Combo.js';
import {GitHubAppSetup} from '../settings/GitHubAppSetup.js';

const SAVED = 'tablemaker.github'; // 마지막에 연 저장소 · 브랜치 · 폴더
const OPENS = /\.(json|csv|md)$/i;  // 폴더 목록에 넣을 파일 (불러오기가 여는 것)
const enc = p => p.split('/').map(encodeURIComponent).join('/');

// 불러오기 ▾ → GitHub: 저장소 · 브랜치 · 폴더를 고르면 폴더 불러오기와 같은 목록 창(ImportPicker)을 거쳐 연다.
// 세 칸 모두 직접 적거나 목록에서 고른다: 로그인했으면(☰ → GitHub 계정) 내 저장소 목록, 저장소를 고르면 브랜치 목록,
// 브랜치를 고르면 JSON · CSV · 설명서가 든 폴더 목록. 공개 저장소는 로그인 없이 주소로도 열린다.
// 한도: 로그인 없이 시간당 60번(파일 내려받기는 raw 주소라 안 셈), 로그인하면 5,000번
// ponytail: 읽기만. 저장(커밋) · 팀 링크는 다음 단계
export class GitHubImport {
  constructor(app) {
    this.app = app;
    this.trees = new Map(); // 'owner/repo@브랜치' → {branch, tree} (창에서 폴더 목록을 만들 때 받은 것을 열 때 다시 쓴다)
    const menu = $('openMenu');
    menu.querySelector('.menu').addEventListener('click', e => {
      if (!e.target.closest('[data-gh]')) return;
      menu.open = false;
      this.open();
    });
  }

  get account() { return this.app.githubAccount; }

  async open() {
    await this.account.ready; // 로그인했는지 알아야 내 저장소 목록을 보여 줄 수 있다
    const got = await this.ask();
    if (!got) return;
    const {owner, repo, path} = got, gh = this.account, link = this.app.projects.current.link;
    try {
      const {branch, tree, empty} = await this.tree(owner, repo, got.branch);
      // 이미 이 저장소 · 브랜치 · 폴더에 연결된 프로젝트면 탭을 또 더하지 않고 갱신한다(↻와 같다)
      if (link && link.owner === owner && link.repo === repo && link.branch === branch && link.path === path) {
        if (await ask('이미 연결된 저장소입니다', `이 프로젝트는 ${owner}/${repo}${path ? ` · ${path}` : ''} (${branch})에 연결돼 있습니다. 새 탭으로 더하지 않고 GitHub 것으로 갱신할까요?`, '갱신하기', 'primary'))
          this.app.githubSync.sync();
        return;
      }
      const pre = path ? path + '/' : '';
      // 불러오기가 여는 파일(JSON · CSV · 설명서)만. 들어갈 곳을 짐작하려면 내용을 봐야 해서 목록 창 전에 모두 내려받는다
      const files = tree.filter(n => n.type === 'blob' && n.path.startsWith(pre) && OPENS.test(n.path)).map(n => {
        const rel = n.path.slice(pre.length);
        // 폴더로 고른 파일(File)처럼 보이게: 이름 · 폴더 안 경로 · 크기 · 내용
        return {name: rel.split('/').pop(), webkitRelativePath: `${repo}/${rel}`, size: n.size || 0,
          arrayBuffer: async () => (await (gh.loggedIn
            ? gh.req(`${GITHUB_API}/repos/${owner}/${repo}/contents/${enc(n.path)}?ref=${encodeURIComponent(branch)}`, true)
            : gh.req(`https://raw.githubusercontent.com/${owner}/${repo}/${enc(branch)}/${enc(n.path)}`))).arrayBuffer()};
      });
      if (empty) throw new Error('아직 파일이 하나도 없는 빈 저장소입니다. 먼저 파일 저장 ▾ → GitHub에 커밋으로 올려 보세요');
      if (!files.length) throw new Error(`'${path || '/'}' 폴더에 JSON · CSV · 설명서가 없습니다`);
      if (!await this.app.importer.openFiles(files, {folder: true, title: `GitHub '${owner}/${repo}'${path ? ` · ${path}` : ''} (${branch})`})) return;
      // 가져왔으면 이 프로젝트를 그 저장소 폴더에 연결한다 (탭 줄 맨 앞 ↻로 갱신)
      await this.app.githubSync.relink(owner, repo, branch, path);
      this.app.toast(`이 프로젝트를 ${owner}/${repo}${path ? ` · ${path}` : ''}에 연결했습니다 · 탭 줄 맨 앞 ↻로 갱신합니다`);
    } catch (err) {
      this.app.toast('GitHub에서 불러오기 실패\n' + err.message, 'bad');
    }
  }

  // 저장소의 파일 목록 (브랜치를 비우면 기본 브랜치) → {branch, tree, empty}
  // 막 만든 빈 저장소는 GitHub이 409('Git Repository is empty')로 답해서 빈 목록 + empty로 돌려준다 (커밋할 때 저장소를 시작하게)
  // fresh: 받아 둔 것을 버리고 지금 것을 다시 받는다 (커밋할 때 GitHub과 비교하려고)
  async tree(owner, repo, branch, fresh) {
    const key = `${owner}/${repo}@${branch}`, gh = this.account, base = `${GITHUB_API}/repos/${owner}/${repo}`;
    if (fresh || !this.trees.has(key)) {
      const b = branch || (await (await gh.req(base)).json()).default_branch;
      try {
        const t = await (await gh.req(`${base}/git/trees/${encodeURIComponent(b)}?recursive=1`)).json();
        this.trees.set(key, {branch: b, tree: t.tree, empty: false});
      } catch (err) {
        if (err.status !== 409) throw err;
        this.trees.set(key, {branch: b, tree: [], empty: true});
      }
    }
    return this.trees.get(key);
  }

  // 'owner/repo', 'https://github.com/owner/repo', 브라우저 주소창의 '…/tree/브랜치/폴더' 모두 받는다
  static parse(text) {
    const m = /^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*?))?)?\/?$/.exec(text.trim());
    return m && {owner: m[1], repo: m[2], branch: m[3] || '', path: m[4] ? decodeURIComponent(m[4]) : ''};
  }

  // 커밋 창의 '+ 새 폴더…': 지금 폴더 칸의 경로(비었거나 '/'면 맨 위) 아래에 만들 이름을 묻고, 칸을 그 경로로 바꾼다
  async newFolder(d) {
    const path = d.querySelector('.path'), err = d.querySelector('.err'), parent = path.value.trim().replace(/^\/+|\/+$/g, '');
    const name = await askText('새 폴더', `${parent ? `'${parent}'` : '맨 위(/)'} 아래에 만들 폴더 이름`, '', '만들기');
    if (!name) return;
    const clean = name.replace(/^\/+|\/+$/g, '');
    if (!clean || /[\\:*?"<>|]/.test(clean)) { err.textContent = '폴더 이름에 \\ : * ? " < > | 는 쓸 수 없습니다'; return; }
    path.value = (parent ? parent + '/' : '') + clean;
    err.textContent = '';
    d.querySelector('.hint').textContent = `'${path.value}' 폴더는 커밋하면 파일과 함께 만들어집니다.`;
  }

  // 저장소 고르는 창 (불러오기, 그리고 GitHub에 커밋할 곳 고르기). 확인하면 {owner, repo, branch, path}, 취소하면 null
  // newFolder: 커밋할 곳 고르기 — 폴더 목록에 저장소의 모든 폴더와 '/'(맨 위), 맨 아래 '+ 새 폴더…'(지금 칸의 폴더 아래에 이름을 정해 만든다).
  //   Git에는 빈 폴더가 없어서 새 폴더는 커밋할 때 파일이 들어가며 생긴다. 없는 경로를 직접 적어도 같다
  ask({title = 'GitHub에서 불러오기', ok = '폴더 열기', newFolder = false} = {}) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SAVED)) || {}; } catch {}
    const gh = this.account, d = document.createElement('dialog');
    d.className = 'popup ghimport';
    d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><div class="who"></div>` +
      `<label class="asktext">저장소 <input class="repo" required value="${esc(saved.repo || '')}" placeholder="owner/repo 또는 GitHub 주소" autofocus></label>` +
      `<label class="asktext">브랜치 <input class="branch" value="${esc(saved.branch || '')}" placeholder="비우면 기본 브랜치"></label>` +
      `<label class="asktext">폴더 <input class="path" value="${esc(saved.path || '')}" placeholder="${newFolder ? '예: Assets/Resources/Json (/ 나 비우면 맨 위)' : '예: Assets/Resources/Json (비우면 전체)'}"></label>` +
      `<p class="dim small hint">칸을 누르면 고를 수 있는 목록이 나옵니다.${newFolder ? ' 폴더 목록 맨 아래 「+ 새 폴더…」로 지금 고른 폴더 아래에 새 폴더를 만들 수 있습니다.' : ''}</p><p class="bad small err"></p>` +
      `<div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">${esc(ok)}</button></div></form>`;
    const $d = c => d.querySelector(c), val = c => $d(c).value.trim(), err = $d('.err');
    const combo = {
      ghRepos: new Combo($d('.repo'), gh.loggedIn ? '내 저장소 목록을 받는 중이거나 없습니다. owner/repo를 직접 적어도 됩니다' : '로그인하면 내 저장소 목록이 나옵니다. owner/repo를 직접 적어도 됩니다'),
      ghBranches: new Combo($d('.branch'), '저장소를 고르면 브랜치 목록이 나옵니다. 비우면 기본 브랜치'),
      ghFolders: new Combo($d('.path'), newFolder ? '아직 폴더가 없습니다. 아래 「+ 새 폴더…」로 만들거나, 비워 두면 맨 위에 저장합니다' : '저장소를 고르면 JSON · CSV · 설명서가 든 폴더가 나옵니다',
        newFolder ? [{label: '+ 새 폴더… (지금 칸의 폴더 아래에)', run: () => this.newFolder(d)}] : []),
    };
    const fill = (id, list) => combo[id].set(list);
    const who = () => {
      // GitHub로 로그인했으면 목록은 앱을 설치한 저장소뿐이라, 없는 저장소는 앱 설치로 안내한다
      const install = gh.isApp && gh.installUrl ? ` · 목록에 없으면 <a href="${gh.installUrl}" target="_blank" rel="noopener">GameTableMaker 앱 설치</a>` : '';
      $d('.who').innerHTML = gh.loggedIn
        ? `<p class="dim small">${esc(gh.user.login)}(으)로 로그인됨 · 내 저장소를 목록에서 고를 수 있습니다${install}</p>`
        : '<p class="dim small">공개 저장소는 주소만 적으면 됩니다. 내 저장소 목록 · 비공개 저장소는 <button type="button" class="link login">GitHub 로그인</button></p>';
      if (gh.loggedIn) gh.repos().then(list => {
        fill('ghRepos', list);
        // 앱이 설치된 저장소가 하나도 없으면: 내 저장소면 설치, 팀 저장소면 주인에게 보낼 안내 복사
        if (!list.length && gh.isApp && gh.installUrl) $d('.who').insertAdjacentHTML('beforeend',
          '<p class="small warnline">아직 앱이 설치된 저장소가 없습니다 — ' +
          `<a href="${gh.installUrl}">내 저장소에 앱 설치</a> · <button type="button" class="link invite">팀 저장소 주인에게 보낼 안내 복사</button></p>`);
      }).catch(() => {});
    };
    // 저장소를 고르면 브랜치 목록, 브랜치까지 정하면 JSON · CSV · 설명서가 든 폴더 목록 (적는 동안은 잠깐 기다렸다가)
    let timer = 0;
    const lists = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const p = GitHubImport.parse(val('.repo'));
        if (!p) return;
        err.textContent = '';
        try {
          gh.req(`${GITHUB_API}/repos/${p.owner}/${p.repo}/branches?per_page=100`).then(r => r.json())
            .then(bs => fill('ghBranches', bs.map(b => b.name))).catch(() => {});
          const {tree} = await this.tree(p.owner, p.repo, val('.branch') || p.branch);
          // 커밋할 곳: 모든 폴더. 불러올 곳: JSON · CSV · 설명서가 든 폴더만. 맨 위에 둘 수 있으면(커밋) · 맨 위에 파일이 있으면(불러오기) '/'도
          const dirs = newFolder ? tree.filter(n => n.type === 'tree').map(n => n.path)
            : [...new Set(tree.filter(n => n.type === 'blob' && OPENS.test(n.path) && n.path.includes('/')).map(n => n.path.replace(/\/[^/]*$/, '')))];
          const root = newFolder || tree.some(n => n.type === 'blob' && OPENS.test(n.path) && !n.path.includes('/'));
          fill('ghFolders', [...(root ? ['/'] : []), ...dirs.sort()]);
        } catch (e) { err.textContent = e.message; }
      }, 400);
    };
    $d('.repo').addEventListener('input', lists);
    $d('.branch').addEventListener('input', lists);
    d.addEventListener('click', async e => {
      if (e.target.closest('.invite')) return GitHubAppSetup.copy(this.app, gh);
      if (!e.target.closest('.login')) return;
      if (await gh.login()) { who(); lists(); }
    });
    $d('.cancel').onclick = () => d.close('');
    $d('form').addEventListener('submit', e => {
      if (GitHubImport.parse(val('.repo'))) return;
      e.preventDefault(); // 저장소 주소를 못 읽으면 창을 닫지 않는다
      err.textContent = "저장소는 'owner/repo'나 GitHub 주소로 적어 주세요";
    });
    who();
    if (saved.repo) lists();
    document.body.append(d);
    d.showModal();
    return new Promise(done => d.addEventListener('close', () => {
      clearTimeout(timer);
      const p = d.returnValue === 'ok' && GitHubImport.parse(val('.repo'));
      const got = p && {...p, branch: val('.branch') || p.branch, path: (val('.path') || p.path).replace(/^\/+|\/+$/g, '')};
      d.remove();
      if (got) try { localStorage.setItem(SAVED, JSON.stringify({repo: `${got.owner}/${got.repo}`, branch: got.branch, path: got.path})); } catch {}
      done(got || null);
    }));
  }
}
