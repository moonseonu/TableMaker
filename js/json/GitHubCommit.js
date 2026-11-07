import {$, esc} from '../common/util.js';
import {CheckPicker} from '../common/CheckPicker.js';
import {GITHUB_API} from '../settings/GitHubAccount.js';
import {JsonFormat} from './JsonFormat.js';
import {JsonDiff} from './JsonDiff.js';
import {oldDescName} from './DescName.js';

const enc = p => p.split('/').map(encodeURIComponent).join('/');
const MAX_LINES = 200; // 상태를 펼쳤을 때 보이는 바뀐 칸 수
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

// 파일 저장 ▾ → GitHub에 커밋: 저장소 · 브랜치 · 폴더(불러오기에서 쓰던 것)를 고르면, 프로젝트 전체 저장과 같은 파일들
// (모든 탭의 JSON · 설명서 + _TableMaker.md)을 GitHub에 있는 것과 비교해 새 파일 · 바뀐 파일만 목록으로 보여 주고,
// 고른 것을 커밋 하나로 올린다 (Git Data API: 트리 → 커밋 → 브랜치 옮기기).
// 그사이 다른 사람이 먼저 커밋했으면 브랜치를 옮길 수 없어서(덮어쓰지 않음) 다시 해 달라고 알린다.
// 막 만든 빈 저장소는 Git Data API가 안 돼서(409), 첫 파일 하나를 Contents API로 올려 저장소를 시작한 뒤 나머지를 커밋한다(커밋 2개)
// ponytail: 지운 탭의 파일은 GitHub에서 지우지 않는다. 필요하면 목록에 '지움'을 넣어 트리에서 sha: null로
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
    const where = await this.app.github.ask({title: 'GitHub에 커밋', ok: '바뀐 파일 보기', newFolder: true});
    if (!where) return;
    const {owner, repo, path} = where, api = `${GITHUB_API}/repos/${owner}/${repo}`, pre = path ? path + '/' : '';
    try {
      const {branch, tree, empty} = await this.app.github.tree(owner, repo, where.branch, true);
      const remote = new Map(tree.filter(n => n.type === 'blob').map(n => [n.path, n.sha]));
      // 이 저장소 폴더에 연결된 프로젝트면, 마지막으로 맞춘 뒤 '내가' 고친 파일만 올린다
      // (팀원이 그사이 고친 파일을 내 옛 내용으로 되돌리지 않게). 그사이 GitHub에서도 바뀐 파일은 ⚠로 표시하고 처음엔 체크를 뺀다
      const link = this.app.projects.current.link;
      const same = link && link.owner === owner && link.repo === repo && link.branch === branch && link.path === path;
      const files = [], made = this.app.exporter.projectFiles();
      let learned = false;
      for (const f of made) {
        const now = remote.get(pre + f.name), was = await blobSha(f.text);
        if (was === now) continue;
        if (same && was === (link.local || {})[f.name]) continue; // 마지막으로 맞춘 뒤 내가 안 고침 (GitHub 쪽 변경은 ↻로 받는다)
        // GitHub에 같은 JSON이 있으면 받아서 데이터를 직접 비교한다: 글자 모양은 GitHub 파일 것을 배워 그대로 쓰고(바뀐 줄만 보이게),
        // 데이터가 같으면(모양만 달랐으면) 목록에서 뺀다. 바뀐 칸은 상태에 세어 보이고 마우스를 올리면 하나하나 보인다
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
        const risky = same && now !== link.files[f.name];
        // 상태: 한 줄로 보이고, 누르면 아래로 펼쳐져 전부(바뀐 컬럼 · 칸 하나하나 · 더하고 뺀 줄) 보인다
        const head = (risky ? '⚠ GitHub에서도 바뀜 (올리면 덮어씀) · ' : '') + (diff ? JsonDiff.summary(diff) : now ? '바뀜' : '새 파일');
        const more = [...head.split(' · '), ...(diff ? diff.lines.slice(0, MAX_LINES) : []), ...(diff?.lines.length > MAX_LINES ? [`… 외 ${diff.lines.length - MAX_LINES}개`] : [])];
        const state = more.length > 1 ? `<details class="state"><summary>${esc(head)}</summary><ul>${more.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>` : `<span class="state">${esc(head)}</span>`;
        files.push({...f, sha: mine, risky, diff, isNew: !now, state});
      }
      // 여기서 지운 표: 마지막으로 맞출 때 이 프로젝트에 있던 파일(link.local)인데 지금 탭에 없고 GitHub에는 남아 있으면 '삭제'로 올린다.
      // 여기가 원본이라 지운 것도 바뀐 것이다(이름을 바꾼 탭은 옛 이름 삭제 + 새 이름 새 파일). 그사이 팀원이 고친 파일이면 ⚠, 처음엔 체크를 뺀다
      // 예전 이름 설명서(ItemDataTable.md): 새 이름(ItemDataTable_Desc.md)으로 올리면서 GitHub에 남은 예전 파일은 지운다 (연결 여부와 상관없이)
      const here = new Set(made.map(f => f.name)), listed = new Set();
      for (const f of made) {
        const old = oldDescName(f.name);
        if (old === f.name || here.has(old) || !remote.has(pre + old)) continue;
        listed.add(old);
        files.push({name: old, del: true, renamed: f.name, state: `<span class="state">${esc(`옛 이름이라 지움 (→ ${f.name})`)}</span>`});
      }
      if (same) {
        for (const name of Object.keys(link.local || {})) {
          const now = remote.get(pre + name);
          if (here.has(name) || listed.has(name) || !now) continue;
          const risky = now !== link.files[name];
          files.push({name, del: true, risky, state: `<span class="state">${esc((risky ? '⚠ GitHub에서도 바뀜 (지우면 그 변경도 사라짐) · ' : '') + '⚠ 삭제 (여기서 지운 표)')}</span>`});
        }
      }
      if (learned) this.app.workbook.save(); // 배운 글자 모양은 표에 남긴다 (되돌리기 기록과 상관없다)
      const behind = same && [...remote].some(([p, s]) => p.startsWith(pre) && !p.slice(pre.length).includes('/') && link.files[p.slice(pre.length)] !== s);
      if (!files.length) return this.app.toast(`올릴 변경이 없습니다 · ${owner}/${repo}${path ? ` · ${path}` : ''}${behind ? '\nGitHub에 아직 받지 않은 변경이 있습니다. ↻로 갱신하세요' : ''}`);
      // 커밋 메시지: 첫 줄은 제목, 그 아래에 프로그래머가 알아야 할 변경(컬럼 삭제 · 타입 변경 · 컬럼 추가 · 새 테이블)과 테이블별 데이터 변화.
      // 고른 파일이 바뀌면 다시 만든다(직접 고쳐 쓰기 시작하면 그대로 둔다)
      const message = picked => {
        const fs = picked.map(i => files[i]).filter(f => f.name.endsWith('.json')), names = fs.map(f => f.name.slice(0, -5));
        const title = `GameTableMaker: ${names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` 외 ${names.length - 3}개` : '') : '설명 · 설정'} 수정`;
        const body = fs.flatMap(f => { const n = f.name.slice(0, -5); return f.del ? [`⚠ 테이블 삭제: ${n}`] : f.diff ? JsonDiff.notes(n, f.diff) : [f.isNew ? `+ 새 테이블: ${n}` : `· ${n}: 바뀜`]; });
        const renamed = picked.map(i => files[i]).filter(f => f.renamed);
        if (renamed.length) body.push(`· 설명서 이름 변경: ${renamed.length === 1 ? `${renamed[0].name} → ${renamed[0].renamed}` : `${renamed.length}개 (*.md → *_Desc.md)`}`);
        return title + (body.length ? '\n\n' + body.join('\n') : '');
      };
      const msg = message(files.map((f, i) => i).filter(i => !files[i].risky));
      const res = await CheckPicker.pick({
        title: esc(`GitHub에 커밋 · ${owner}/${repo}${path ? ` · ${path}` : ''} (${branch})`), ok: '커밋',
        text: (same ? '마지막으로 갱신한 뒤 내가 고친 파일만 보입니다.' : 'GitHub에 있는 것과 다른 파일만 보입니다.') +
          ' 띄어쓰기 · 들여쓰기 같은 글자 모양 차이는 바뀐 것으로 치지 않고, GitHub 파일 모양 그대로 올립니다. 상태를 누르면 펼쳐져 바뀐 칸이 하나하나 보입니다. 올릴 것을 고르세요.' +
          (files.some(f => f.del) ? ' ⚠ 삭제는 여기서 지운 표라 커밋하면 GitHub에서도 지워집니다(GitHub 기록에서 되살릴 수 있습니다).' : '') +
          (files.some(f => f.risky) ? ' ⚠ GitHub에서도 바뀜은 그사이 팀원도 고친 파일이라 올리면 덮어씁니다. 먼저 ↻로 갱신해 보세요.' : '') +
          `<label class="asktext commitmsg">커밋 메시지 <span class="small">첫 줄은 제목, 아래는 자세한 설명 (⚠는 코드에 영향을 줄 수 있는 변경)</span><textarea class="msg" rows="10" spellcheck="false">${esc(msg)}</textarea></label>`,
        heads: ['파일', '상태'],
        rows: files.map(f => [`<b>${esc(f.name)}</b>`, f.state]), // 폴더는 제목에 있다
        checked: files.map(f => !f.risky),
        setup: d => {
          const box = d.querySelector('.msg');
          let typed = false;
          box.addEventListener('input', () => typed = true);
          const redo = () => { if (!typed) box.value = message([...d.querySelectorAll('tbody input[type=checkbox]')].filter(b => b.checked).map(b => +b.value)); };
          d.addEventListener('click', redo); // 줄을 눌러 고르기 · 모두 고르기 (CheckPicker가 체크를 바꾼 뒤)
          d.addEventListener('change', redo);
        },
        read: d => d.querySelector('.msg').value.trim() || msg,
      });
      if (!res) return;
      let todo = res.picked.map(i => files[i]);
      if (empty) { // 빈 저장소: 첫 파일로 저장소(와 브랜치)를 시작한다
        const [first] = todo;
        // 브랜치는 적지 않는다: 빈 저장소에서는 아직 없는 브랜치라, 저장소 기본 브랜치로 시작하게 둔다
        await gh.req(`${api}/contents/${enc(pre + first.name)}`, false, {method: 'PUT', body: {message: res.values, content: base64(first.text)}});
        todo = todo.slice(1);
      }
      if (todo.length) await this.commitAll(api, branch, pre, todo, res.values);
      this.app.github.trees.clear(); // 다음 불러오기 · 비교는 새로
      // 연결: 처음이면 지금 GitHub 상태로 연결하고, 이미 연결돼 있으면 올린 파일만 '맞춤'으로 (받지 않은 팀원 변경은 ↻로 받게 남긴다)
      const sync = this.app.githubSync;
      if (!same) await sync.relink(owner, repo, branch, path);
      else {
        // 올린 파일은 '맞춤'으로, 지운 파일은 기억에서 뺀다 (체크를 뺀 삭제는 남아서 다음 커밋에 또 나온다)
        const done = res.picked.map(i => files[i]), up = Object.fromEntries(done.filter(f => !f.del).map(f => [f.name, f.sha]));
        const gone = new Set(done.filter(f => f.del).map(f => f.name)), keep = o => Object.fromEntries(Object.entries(o).filter(([n]) => !gone.has(n)));
        const head = await sync.head(link, true);
        sync.setLink({...link, sha: head.sha, at: Date.now(), files: keep({...link.files, ...up}), local: keep({...link.local, ...up})});
      }
      this.app.safari.backedUp();
      this.app.toast(`GitHub에 커밋했습니다 · 파일 ${res.picked.length}개\n${owner}/${repo} (${branch})` +
        (same ? '' : '\n이 프로젝트를 이 저장소에 연결했습니다 · 탭 줄 맨 앞 ↻로 갱신합니다') +
        (behind ? '\nGitHub에 아직 받지 않은 변경이 있습니다. ↻로 갱신하세요' : ''));
    } catch (err) {
      this.app.toast('GitHub에 커밋 실패\n' + err.message, 'bad');
    }
  }

  // 여러 파일을 커밋 하나로: 지금 브랜치 끝 → 그 위에 새 트리 → 커밋 → 브랜치를 새 커밋으로 (다른 사람이 먼저 옮겼으면 422).
  // 지울 파일(del)은 트리에 sha: null로 넣으면 GitHub이 그 파일을 뺀다
  async commitAll(api, branch, pre, todo, message) {
    const gh = this.app.githubAccount, send = (url, method, body) => gh.req(url, false, {method, body}).then(r => r.json());
    const head = (await (await gh.req(`${api}/git/ref/heads/${enc(branch)}`)).json()).object.sha;
    const base = (await (await gh.req(`${api}/git/commits/${head}`)).json()).tree.sha;
    const t = await send(`${api}/git/trees`, 'POST', {base_tree: base,
      tree: todo.map(f => f.del ? {path: pre + f.name, mode: '100644', type: 'blob', sha: null} : {path: pre + f.name, mode: '100644', type: 'blob', content: f.text})});
    const c = await send(`${api}/git/commits`, 'POST', {message, tree: t.sha, parents: [head]});
    try { await send(`${api}/git/refs/heads/${enc(branch)}`, 'PATCH', {sha: c.sha}); } catch (err) {
      throw err.status === 422 ? new Error('그사이 다른 사람이 먼저 커밋했습니다. 덮어쓰지 않았으니 GitHub에서 다시 불러와 확인한 뒤 다시 커밋해 주세요') : err;
    }
  }
}
