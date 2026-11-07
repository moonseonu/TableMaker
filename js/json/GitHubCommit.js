import {$, esc} from '../common/util.js';
import {GITHUB_API} from '../settings/GitHubAccount.js';
import {JsonFormat} from './JsonFormat.js';
import {JsonDiff} from './JsonDiff.js';
import {oldDescName} from './DescName.js';
import {Help} from '../common/Help.js';
import {CommitDialog} from './CommitDialog.js';

const enc = p => p.split('/').map(encodeURIComponent).join('/');
const extOf = n => n.slice(n.lastIndexOf('.')); // 이름을 바꾼 탭 짝 찾기: 같은 종류 파일끼리만
const TYPE = {string: 'String', enum: 'String', int: 'Int', float: 'Float', bool: 'Bool'}; // 표의 타입 → JSON 값 타입 (커밋 메시지의 타입 변경)
// 글자 → base64 (Contents API는 파일 내용을 base64로 받는다). 한글이 있어 UTF-8 바이트로, 큰 파일도 되게 나눠서
const base64 = text => {
  const b = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

// git이 파일 내용을 구분하는 번호(blob SHA-1): 'blob 길이\0' + 내용. GitHub 쪽 파일과 같은지 내려받지 않고 비교한다
export async function blobSha(text) {
  const body = new TextEncoder().encode(text), head = new TextEncoder().encode(`blob ${body.length}\0`);
  const buf = new Uint8Array(head.length + body.length);
  buf.set(head);
  buf.set(body, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 파일 저장 ▾ → GitHub에 커밋. 창 하나(CommitDialog)에서 위의 저장소 · 브랜치 · 폴더를 고르면, 프로젝트 전체 저장과 같은 파일들
// (모든 탭의 JSON · 설명서 + _TableMaker.md)을 그 폴더에 있는 것과 비교해(plan) 신규 · 수정 · 삭제 목록을 보여 주고,
// 고른 것을 커밋 하나로 올린다(send, Git Data API: 트리 → 커밋 → 브랜치 옮기기).
// 그사이 다른 사람이 먼저 커밋했으면 브랜치를 옮길 수 없어서(덮어쓰지 않음) 다시 해 달라고 알린다.
// 막 만든 빈 저장소는 Git Data API가 안 돼서(409), 첫 파일 하나를 Contents API로 올려 저장소를 시작한 뒤 나머지를 커밋한다(커밋 2개)
export class GitHubCommit {
  constructor(app) {
    this.app = app;
    const menu = $('saveMenu');
    menu.querySelector('.menu').addEventListener('click', e => {
      if (!e.target.closest('[data-gh-commit]')) return;
      menu.open = false;
      this.open();
    });
  }

  async open() {
    const gh = this.app.githubAccount;
    await gh.ready;
    if (!gh.loggedIn && !await gh.login()) return; // 커밋은 로그인해야 한다
    const res = await CommitDialog.show(this);
    if (!res) return;
    try { await this.send(res.ctx, res.files, res.message); } catch (err) { this.app.toast('GitHub에 커밋 실패\n' + err.message, 'bad'); }
  }

  // 그 저장소 폴더와 비교해 올릴 파일 목록 → ctx {owner, repo, path, branch, api, pre, empty, same, link, files, behind}.
  // files: [{name, text, sha, kind: 'new' | 'mod' | 'del', risky, diff, renamedFrom}]
  async plan({owner, repo, branch: want, path}) {
    const gh = this.app.githubAccount, api = `${GITHUB_API}/repos/${owner}/${repo}`, pre = path ? path + '/' : '';
    const {branch, tree, empty} = await this.app.github.tree(owner, repo, want, true);
    const remote = new Map(tree.filter(n => n.type === 'blob').map(n => [n.path, n.sha]));
    // 이 저장소 폴더에 연결된 프로젝트면, 마지막으로 맞춘 뒤 '내가' 고친 파일만 올린다
    // (팀원이 그사이 고친 파일을 내 옛 내용으로 되돌리지 않게). 그사이 GitHub에서도 바뀐 파일은 ⚠(risky)로 표시하고 처음엔 체크를 뺀다
    const link = this.app.projects.current.link;
    const same = !!link && link.owner === owner && link.repo === repo && link.branch === branch && link.path === path;
    const files = [], made = this.app.exporter.projectFiles();
    let learned = false;
    for (const f of made) {
      const now = remote.get(pre + f.name), was = await blobSha(f.text);
      if (was === now) continue;
      if (same && was === (link.local || {})[f.name]) continue; // 마지막으로 맞춘 뒤 내가 안 고침 (GitHub 쪽 변경은 ↻로 받는다)
      // GitHub에 같은 JSON이 있으면 받아서 데이터를 직접 비교한다: 글자 모양은 GitHub 파일 것을 배워 그대로 쓰고(바뀐 줄만 보이게),
      // 데이터가 같으면(모양만 달랐으면) 목록에서 뺀다. 바뀐 칸 · 컬럼은 커밋 메시지에 적는다
      let diff = null;
      if (now && f.table) {
        try {
          const text = await (await gh.req(`${api}/contents/${enc(pre + f.name)}?ref=${encodeURIComponent(branch)}`, true)).text();
          const fmt = JsonFormat.detect(text);
          if (JSON.stringify(fmt) !== JSON.stringify(f.table.fmt)) { f.table.fmt = fmt; learned = true; f.text = JsonFormat.write(f.table.toData(), fmt); }
          // 값만 봐서는 모르는 타입: GitHub 쪽은 1.0처럼 적힌 컬럼이 Float, 내 쪽은 표에서 정한 타입
          const types = Object.fromEntries(f.table.cols.map(c => [c.name, c.id ? f.table.prefixInJson ? 'String' : 'Int' : TYPE[c.type]]));
          diff = JsonDiff.compare(JSON.parse(text), f.table.toData(), {a: Object.fromEntries(fmt.dot.map(c => [c, 'Float'])), b: types});
          if (diff.same) continue;
        } catch {} // 받지 못했거나 JSON이 아니면 예전처럼 파일째 비교
      }
      const mine = await blobSha(f.text);
      if (mine === now) continue;
      files.push({...f, sha: mine, kind: now ? 'mod' : 'new', risky: same && now !== link.files[f.name], diff});
    }
    // 이름만 바뀐 파일은 '신규 + 삭제' 두 줄이 아니라 '수정' 한 줄로: 새 이름 줄에 예전 이름(renamedFrom)을 달고, 커밋할 때 예전 파일을 함께 지운다.
    //  · 예전 이름 설명서(ItemDataTable.md → ItemDataTable_Desc.md): 연결 여부와 상관없이
    //  · 이름을 바꾼 탭(연결된 프로젝트): 지운 파일과 내용이 똑같은 새 파일
    const here = new Set(made.map(f => f.name)), paired = new Set(), fresh = name => files.find(f => f.name === name && f.kind === 'new' && !f.renamedFrom);
    const rename = (f, old) => { paired.add(old); Object.assign(f, {renamedFrom: old, kind: 'mod'}); };
    for (const f of made) {
      const old = oldDescName(f.name), nf = fresh(f.name);
      if (old !== f.name && !here.has(old) && remote.has(pre + old) && nf) rename(nf, old);
    }
    // 여기서 지운 표: 마지막으로 맞출 때 이 프로젝트에 있던 파일(link.local)인데 지금 탭에 없고 GitHub에는 남아 있으면 삭제로 올린다.
    // 여기가 원본이라 지운 것도 바뀐 것이다. 그사이 팀원이 고친 파일이면 ⚠, 처음엔 체크를 뺀다
    if (same) {
      for (const name of Object.keys(link.local || {})) {
        const now = remote.get(pre + name);
        if (here.has(name) || paired.has(name) || !now) continue;
        const risky = now !== link.files[name], twin = !risky && files.find(f => f.kind === 'new' && !f.renamedFrom && f.sha === now && extOf(f.name) === extOf(name));
        if (twin) { rename(twin, name); continue; }
        files.push({name, kind: 'del', risky});
      }
    }
    // 예전 이름 설명서인데 새 이름 파일은 이미 GitHub에 같은 내용으로 있으면(올릴 게 없으면) 예전 파일만 지운다
    for (const f of made) {
      const old = oldDescName(f.name);
      if (old !== f.name && !here.has(old) && remote.has(pre + old) && !paired.has(old)) { paired.add(old); files.push({name: old, kind: 'del', old: true}); }
    }
    if (learned) this.app.workbook.save(); // 배운 글자 모양은 표에 남긴다 (되돌리기 기록과 상관없다)
    const behind = same && [...remote].some(([p, s]) => p.startsWith(pre) && !p.slice(pre.length).includes('/') && link.files[p.slice(pre.length)] !== s);
    return {owner, repo, path, branch, api, pre, empty, same, link, files, behind};
  }

  // 커밋 메시지: 첫 줄은 제목, 그 아래에 프로그래머가 알아야 할 변경(컬럼 삭제 · 이름 · 타입 변경 · 새 · 지운 테이블)과 테이블별 데이터 변화
  message(picked) {
    const fs = picked.filter(f => f.name.endsWith('.json')), names = fs.map(f => f.name.slice(0, -5));
    const title = `GameTableMaker: ${names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` 외 ${names.length - 3}개` : '') : '설명 · 설정'} 수정`;
    const body = fs.flatMap(f => {
      const n = f.name.slice(0, -5);
      return f.renamedFrom ? [`⚠ 테이블 이름 변경: ${f.renamedFrom.slice(0, -5)} → ${n}`] : f.kind === 'del' ? [`⚠ 테이블 삭제: ${n}`]
        : f.diff ? JsonDiff.notes(n, f.diff) : [f.kind === 'new' ? `+ 새 테이블: ${n}` : `· ${n}: 바뀜`];
    });
    const renamed = picked.filter(f => f.renamedFrom && f.name.endsWith('.md'));
    if (renamed.length) body.push(`· 설명서 이름 변경: ${renamed.length === 1 ? `${renamed[0].renamedFrom} → ${renamed[0].name}` : `${renamed.length}개`}`);
    return title + (body.length ? '\n\n' + body.join('\n') : '');
  }

  // (?) 도움말: 이번 목록에 해당하는 것만
  help(ctx) {
    const fs = ctx?.files || [];
    return Help.list([
      '위의 저장소 · 브랜치 · 폴더를 바꾸면 아래 목록이 그 폴더 기준으로 다시 계산됩니다. 폴더 목록 맨 아래 <b>+ 새 폴더…</b>로 새 폴더도 만들 수 있습니다(커밋할 때 파일과 함께 생김).',
      ctx && (ctx.same ? '마지막으로 갱신한 뒤 <b>내가 고친 파일</b>만 보입니다.' : 'GitHub에 있는 것과 <b>데이터가 다른 파일</b>만 보입니다. 커밋하면 이 프로젝트가 그 폴더에 연결됩니다.'),
      '띄어쓰기 · 들여쓰기 같은 글자 모양 차이는 바뀐 것으로 치지 않고, GitHub 파일 모양 그대로 올립니다.',
      '<b>신규</b> · <b>수정</b> · <b>삭제</b>. 이름만 바뀐 파일(탭 이름 변경, 설명서 <code>이름_Desc.md</code>)은 <b>수정</b>이고 이름 옆에 예전 이름이 보입니다. 커밋하면 새 이름으로 올리고 예전 이름 파일은 지웁니다.',
      fs.some(f => f.kind === 'del') && '<b>삭제</b>는 여기서 지운 표(또는 예전 이름 설명서)라 커밋하면 GitHub에서도 지워집니다(GitHub 기록에서 되살릴 수 있습니다).',
      fs.some(f => f.risky) && '<b>⚠</b>는 그사이 팀원도 고친 파일이라 올리면 덮어씁니다. 처음엔 체크가 빠져 있으니, 먼저 ↻로 갱신해 보세요.',
      '바뀐 칸 · 컬럼 같은 자세한 변경은 <b>커밋 메시지</b>에 자동으로 적힙니다(고른 파일에 맞춰). 첫 줄은 제목, 아래는 설명이고, ⚠는 컬럼 삭제 · 이름 · 타입 변경처럼 코드에 영향을 줄 수 있는 변경입니다.',
    ]);
  }

  // 고른 파일들을 커밋 하나로 올리고 연결을 맞춘다
  async send(ctx, picked, message) {
    const {owner, repo, path, branch, api, pre, empty, same, link, behind} = ctx, gh = this.app.githubAccount;
    // 이름 변경은 새 이름 올리기 + 예전 이름 지우기
    let todo = picked.flatMap(f => f.renamedFrom ? [f, {name: f.renamedFrom, kind: 'del'}] : [f]);
    if (empty) { // 빈 저장소: 첫 파일로 저장소(와 브랜치)를 시작한다
      const [first] = todo;
      // 브랜치는 적지 않는다: 빈 저장소에서는 아직 없는 브랜치라, 저장소 기본 브랜치로 시작하게 둔다
      await gh.req(`${api}/contents/${enc(pre + first.name)}`, false, {method: 'PUT', body: {message, content: base64(first.text)}});
      todo = todo.slice(1);
    }
    if (todo.length) await this.commitAll(api, branch, pre, todo, message);
    this.app.github.trees.clear(); // 다음 불러오기 · 비교는 새로
    this.app.github.remember({owner, repo, branch, path});
    // 연결: 처음이면 지금 GitHub 상태로 연결하고, 이미 연결돼 있으면 올린 파일만 '맞춤'으로 (받지 않은 팀원 변경은 ↻로 받게 남긴다)
    const sync = this.app.githubSync;
    if (!same) await sync.relink(owner, repo, branch, path);
    else {
      // 올린 파일은 '맞춤'으로, 지운 파일은 기억에서 뺀다 (체크를 뺀 삭제는 남아서 다음 커밋에 또 나온다)
      const up = Object.fromEntries(picked.filter(f => f.kind !== 'del').map(f => [f.name, f.sha]));
      const gone = new Set(picked.flatMap(f => f.kind === 'del' ? [f.name] : f.renamedFrom ? [f.renamedFrom] : []));
      const keep = o => Object.fromEntries(Object.entries(o).filter(([n]) => !gone.has(n)));
      const head = await sync.head(link, true);
      sync.setLink({...link, sha: head.sha, at: Date.now(), files: keep({...link.files, ...up}), local: keep({...link.local, ...up})});
    }
    this.app.safari.backedUp();
    this.app.toast(`GitHub에 커밋했습니다 · 파일 ${picked.length}개\n${owner}/${repo} (${branch})` +
      (same ? '' : '\n이 프로젝트를 이 저장소에 연결했습니다 · 탭 줄 맨 앞 ↻로 갱신합니다') +
      (behind ? '\nGitHub에 아직 받지 않은 변경이 있습니다. ↻로 갱신하세요' : ''));
  }

  // 여러 파일을 커밋 하나로: 지금 브랜치 끝 → 그 위에 새 트리 → 커밋 → 브랜치를 새 커밋으로 (다른 사람이 먼저 옮겼으면 422).
  // 지울 파일(kind 'del')은 트리에 sha: null로 넣으면 GitHub이 그 파일을 뺀다
  async commitAll(api, branch, pre, todo, message) {
    const gh = this.app.githubAccount, send = (url, method, body) => gh.req(url, false, {method, body}).then(r => r.json());
    const head = (await (await gh.req(`${api}/git/ref/heads/${enc(branch)}`)).json()).object.sha;
    const base = (await (await gh.req(`${api}/git/commits/${head}`)).json()).tree.sha;
    const t = await send(`${api}/git/trees`, 'POST', {base_tree: base,
      tree: todo.map(f => f.kind === 'del' ? {path: pre + f.name, mode: '100644', type: 'blob', sha: null} : {path: pre + f.name, mode: '100644', type: 'blob', content: f.text})});
    const c = await send(`${api}/git/commits`, 'POST', {message, tree: t.sha, parents: [head]});
    try { await send(`${api}/git/refs/heads/${enc(branch)}`, 'PATCH', {sha: c.sha}); } catch (err) {
      throw err.status === 422 ? new Error('그사이 다른 사람이 먼저 커밋했습니다. 덮어쓰지 않았으니 GitHub에서 다시 불러와 확인한 뒤 다시 커밋해 주세요') : err;
    }
  }
}
