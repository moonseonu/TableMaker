import {$, esc} from '../common/util.js';

export const GITHUB_API = 'https://api.github.com';
const KEY = 'tablemaker.githubToken';

// ☰ → GitHub 계정: 로그인 · 로그아웃과, GitHub API 요청(로그인했으면 토큰을 붙인다).
// 지금 '로그인'은 사용자가 GitHub에서 만든 토큰(Fine-grained, 저장소 Contents: 불러오기만이면 Read-only, 커밋까지면 Read and write)을 붙여넣는 것.
// 로그인 유지(기본 켬)면 이 브라우저에 기억(localStorage), 끄면 이 탭을 닫을 때 잊는다(sessionStorage).
// ponytail: 토큰 붙여넣기. GitHub 앱 + 로그인 처리 서버(Cloudflare Workers)를 붙이면 'GitHub로 로그인' 버튼으로 바꾼다
export class GitHubAccount {
  constructor(app) {
    this.app = app;
    this.el = $('ghAccount');
    this.user = null;
    try { this.token = localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || ''; } catch { this.token = ''; }
    this.el.onclick = e => {
      if (e.target.closest('[data-gh-login]')) { $('appMenu').open = false; this.login(); }
      else if (e.target.closest('[data-gh-logout]')) this.logout();
    };
    this.render();
    // 기억해 둔 토큰이 아직 맞는지 GitHub에 묻는 동안은 로그인 여부를 모른다. GitHub 창들은 ready를 기다린 뒤 연다
    this.ready = this.token ? this.whoami(this.token).then(u => { this.user = u; if (!u) this.forget(); this.render(); }) : Promise.resolve();
  }

  get loggedIn() { return !!this.user; }

  render() {
    this.el.innerHTML = this.user
      ? `<div class="ghuser"><img src="${esc(this.user.avatar_url)}&s=40" alt=""><b>${esc(this.user.login)}</b><button data-gh-logout>로그아웃</button></div>`
      : '<button data-gh-login>GitHub 로그인 <small>저장소에서 불러오기</small></button>';
  }

  // API 요청에 붙일 머리 (로그인했으면 토큰)
  headers(raw) {
    const h = {Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json'};
    if (this.token && this.user) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  // API 요청. 실패하면 이유를 적은 Error (status도 붙인다). send: 쓰기 요청 {method, body(객체)} — 커밋할 때
  async req(url, raw, send) {
    const api = url.startsWith(GITHUB_API), headers = api ? {Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json'} : {};
    if (api && this.token && this.user) headers.Authorization = `Bearer ${this.token}`;
    const init = {headers, cache: 'no-store'};
    if (send) Object.assign(init, {method: send.method, body: JSON.stringify(send.body)});
    const res = await fetch(url, init);
    if (res.ok) return res;
    const used = res.headers.get('x-ratelimit-remaining') === '0';
    throw Object.assign(new Error(res.status === 401 ? '로그인이 풀렸습니다. ☰ → GitHub 로그인을 다시 해 주세요'
      : send && (res.status === 403 || res.status === 404) ? '이 토큰에는 이 저장소에 쓸 권한이 없습니다. 토큰의 Contents 권한을 Read and write로 만들어 다시 로그인해 주세요'
      : used ? `GitHub 요청 한도를 다 썼습니다${this.user ? '' : ' (로그인 없이 시간당 60번, 로그인하면 5,000번)'}`
      : res.status === 404 ? '저장소 · 브랜치 · 폴더를 찾지 못했습니다 (비공개 저장소면 로그인이 필요합니다)'
      : `GitHub 오류 ${res.status}`), {status: res.status});
  }

  // 토큰이 맞으면 GitHub 사용자 정보, 아니면 null
  async whoami(token) {
    try {
      const res = await fetch(`${GITHUB_API}/user`, {headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json'}, cache: 'no-store'});
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  forget() {
    this.token = '';
    this.user = null;
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch {}
  }

  logout() {
    this.forget();
    this.render();
    this.app.toast('GitHub에서 로그아웃했습니다');
  }

  // 로그인 창. 로그인했으면 true, 취소하면 false
  login() {
    const d = document.createElement('dialog');
    d.className = 'popup ghimport';
    d.innerHTML = '<form method="dialog"><h3>GitHub 로그인</h3>' +
      '<p class="dim">로그인하면 내 저장소를 목록에서 고르고, 비공개 저장소도 불러올 수 있습니다.</p>' +
      '<label class="asktext">토큰 <input class="token" type="password" autocomplete="off" required placeholder="github_pat_로 시작하는 글자" autofocus></label>' +
      '<label class="keep"><input type="checkbox" class="keepme" checked> 로그인 유지 <small class="dim">(공용 PC라면 끄세요. 끄면 이 탭을 닫을 때 로그아웃)</small></label>' +
      '<p class="dim small">토큰 만드는 법: GitHub → Settings → Developer settings → ' +
      '<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained token</a> → ' +
      '쓸 저장소를 고르고, Permissions → <b>+ Add permissions</b> → <b>Contents</b>를 불러오기만 하면 <b>Read-only</b>, ' +
      'GitHub에 커밋도 하려면 <b>Read and write</b>로 → Generate token. (내 계정의 Settings입니다. 저장소의 Settings가 아닙니다)</p>' +
      '<p class="bad small err"></p>' +
      '<div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">로그인</button></div></form>';
    const form = d.querySelector('form'), err = d.querySelector('.err'), okBtn = d.querySelector('.primary');
    let ok = false;
    d.querySelector('.cancel').onclick = () => d.close('');
    form.addEventListener('submit', async e => {
      e.preventDefault(); // 토큰이 맞는지 GitHub에 물어본 뒤에 닫는다
      const token = d.querySelector('.token').value.trim();
      okBtn.disabled = true;
      err.textContent = '';
      const user = await this.whoami(token);
      okBtn.disabled = false;
      if (!user) { err.textContent = '토큰이 맞지 않거나 기한이 지났습니다'; return; }
      const keep = d.querySelector('.keepme').checked;
      try { (keep ? localStorage : sessionStorage).setItem(KEY, token); (keep ? sessionStorage : localStorage).removeItem(KEY); } catch {}
      Object.assign(this, {token, user});
      this.render();
      ok = true;
      d.close('ok');
      this.app.toast(`GitHub에 ${user.login}(으)로 로그인했습니다`);
    });
    document.body.append(d);
    d.showModal();
    return new Promise(done => d.addEventListener('close', () => { d.remove(); done(ok); }));
  }
}
