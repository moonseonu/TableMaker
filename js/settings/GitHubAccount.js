import {Help} from '../common/Help.js';
import {$, esc} from '../common/util.js';
import {GitHubAppSetup} from './GitHubAppSetup.js';

export const GITHUB_API = 'https://api.github.com';
const KEY = 'tablemaker.githubToken'; // 로그인 정보 {token, refresh, expires, app}. 예전(토큰 붙여넣기)에는 토큰 글자 그대로였다
const TRIP = 'tablemaker.ghLogin';    // GitHub에 갔다 오는 동안 기억할 것 {state, keep}

// GameTableMaker GitHub App (사이트 주인이 GitHub에 등록, https://github.com/apps/gametablemaker).
// Client ID는 Cloudflare Pages 설정(GITHUB_CLIENT_ID)에 있고 /api/gh/config로 받아 온다(공개해도 되는 값).
// 비밀 키는 Cloudflare 설정(GITHUB_CLIENT_SECRET)에만 있다. clientId를 못 받으면(다른 주소 · 설정 전) 'GitHub로 로그인' 버튼을 숨긴다
export const GH_APP = {clientId: '', slug: 'gametablemaker'};
const LOGIN_HOST = 'gametablemaker.pages.dev'; // 로그인 중간다리(functions/api/gh)가 도는 곳

// ☰ → GitHub 계정: 로그인 · 로그아웃과, GitHub API 요청(로그인했으면 토큰을 붙인다).
// 로그인은 두 가지:
//   GitHub로 로그인 — GitHub 화면에서 허락하면 /api/gh/callback(중간다리)이 토큰을 받아 주소 # 뒤에 실어 돌려보낸다.
//     토큰은 8시간이면 끝나서, 끝나기 5분 전부터 /api/gh/refresh로 새로 받는다. 볼 수 있는 저장소는 앱을 설치한 저장소뿐이다.
//   고급: 토큰으로 로그인 — 사용자가 만든 Fine-grained 토큰을 붙여넣는다(예전 방식, 중간다리가 없어도 된다).
// 로그인 유지(기본 켬)면 이 브라우저에 기억(localStorage), 끄면 이 탭을 닫을 때 잊는다(sessionStorage)
export class GitHubAccount {
  constructor(app) {
    this.app = app;
    this.el = $('ghAccount');
    this.user = null;
    this.load();
    this.el.onclick = e => {
      if (e.target.closest('[data-gh-login]')) { $('appMenu').open = false; this.login(); }
      else if (e.target.closest('[data-gh-logout]')) this.logout();
    };
    this.render();
    // 로그인 중간다리가 있는 곳(pages.dev)에서만 Client ID를 받아 온다
    this.config = location.host === LOGIN_HOST
      ? fetch('/api/gh/config', {cache: 'no-store'}).then(r => r.json()).then(c => { if (c.ready) GH_APP.clientId = c.clientId; }).catch(() => {})
      : Promise.resolve();
    // GitHub에서 돌아왔으면 그 토큰부터. 기억해 둔 토큰이 아직 맞는지 묻는 동안은 로그인 여부를 모르니, GitHub 창들은 ready를 기다린다
    this.ready = (async () => {
      const back = this.fromGitHub();
      if (this.token) { // 확인을 못 했으면(연결 끊김) 저장된 로그인은 지우지 않는다. 이번에만 로그인 안 한 것으로 보고, 다음에 열 때 다시 확인
        const u = await this.whoami(await this.fresh());
        if (u) this.user = u; else if (u === null) this.forget();
      }
      this.render();
      await this.afterLogin(back);
    })();
  }

  // 로그인하고 돌아온 직후. 앱 설치는 중간다리가 Authorize 다음에 바로 설치 화면으로 보내서 처리하니(functions/api/gh/callback.js),
  // 여기까지 와서도 쓸 저장소가 없으면 팀 저장소만 쓰는 경우(설치 건너뛰기 · 앱은 있지만 저장소 0개)라 주인에게 부탁하는 안내를 띄운다
  async afterLogin(back) {
    if (back !== 'login' || !this.user) return;
    this.app.toast(`GitHub에 ${this.user.login}(으)로 로그인했습니다`);
    if (this.isApp && this.installUrl && !(await this.repos().catch(() => [''])).length) GitHubAppSetup.show(this.app, this);
  }

  get loggedIn() { return !!this.user; }
  get isApp() { return !!this.app_; }
  get installUrl() { return GH_APP.slug ? `https://github.com/apps/${GH_APP.slug}/installations/new` : ''; }

  load() {
    let raw = '';
    try { raw = localStorage.getItem(KEY) || ''; this.keep = !!raw; raw = raw || sessionStorage.getItem(KEY) || ''; } catch {}
    let s = {};
    try { s = raw.startsWith('{') ? JSON.parse(raw) : {token: raw}; } catch {}
    this.token = s.token || '';
    this.refresh = s.refresh || '';
    this.expires = s.expires || 0;
    this.app_ = !!s.app;
  }

  save() {
    const v = JSON.stringify({token: this.token, refresh: this.refresh, expires: this.expires, app: this.app_});
    try { (this.keep ? localStorage : sessionStorage).setItem(KEY, v); (this.keep ? sessionStorage : localStorage).removeItem(KEY); } catch {}
  }

  render() {
    this.el.innerHTML = this.user
      ? `<div class="ghuser"><img src="${esc(this.user.avatar_url)}&s=40" alt=""><b>${esc(this.user.login)}</b><button data-gh-logout>로그아웃</button></div>`
      : '<button data-gh-login>GitHub 로그인 <small>저장소에서 불러오기 · 커밋</small></button>';
  }

  // GitHub로 로그인한 토큰이 곧(5분 안에) 끝나는지
  get expired() { return !!this.refresh && !!this.expires && Date.now() >= this.expires - 5 * 60e3; }

  // 쓸 수 있는 토큰. 곧 끝나면 새로 받는다. refresh 토큰은 한 번 쓰면 버려져서,
  // 한꺼번에 온 요청들(파일 여러 개 받기)은 갱신 하나를 같이 기다린다
  fresh() {
    if (!this.expired) return Promise.resolve(this.token);
    return this.renewing ||= this.renew().finally(() => { this.renewing = null; });
  }

  // 갱신 직전에 이 브라우저에 저장된 것을 다시 읽는다: 다른 탭이 먼저 새로 받아 뒀으면 그걸 쓴다.
  // 로그아웃은 GitHub이 refresh 토큰을 거절했을 때만. 연결이 끊긴 것 등은 로그인을 그대로 두고 다음 요청 때 다시 해 본다
  async renew() {
    this.load();
    if (!this.token) { this.forget(); this.render(); return ''; } // 다른 탭에서 로그아웃했다
    if (!this.expired) return this.token;
    const sent = this.refresh;
    let res, t = {};
    try {
      res = await fetch('/api/gh/refresh', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({refresh: sent})});
      t = await res.json().catch(() => ({}));
    } catch { return this.token; }
    if (res.ok && t.token) {
      Object.assign(this, {token: t.token, refresh: t.refresh || sent, expires: t.expiresIn ? Date.now() + t.expiresIn * 1000 : 0});
      this.save();
      return this.token;
    }
    if (res.status !== 401) return this.token;
    this.load();
    if (this.refresh && this.refresh !== sent) return this.token; // 같은 순간 다른 탭이 먼저 새로 받았다
    this.forget();
    this.render();
    this.app.toast('GitHub 로그인이 끝났습니다. ☰ → GitHub 로그인을 다시 해 주세요', 'warn');
    return '';
  }

  // API 요청에 붙일 머리 (로그인했으면 토큰)
  async headers(raw) {
    const h = {Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json'};
    const token = this.token && this.user && await this.fresh();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  // API 요청. 실패하면 이유를 적은 Error (status도 붙인다). send: 쓰기 요청 {method, body(객체)} — 커밋할 때
  async req(url, raw, send) {
    const api = url.startsWith(GITHUB_API), init = {headers: api ? await this.headers(raw) : {}, cache: 'no-store'};
    if (send) Object.assign(init, {method: send.method, body: JSON.stringify(send.body)});
    const res = await fetch(url, init);
    if (res.ok) return res;
    const used = res.headers.get('x-ratelimit-remaining') === '0', app = this.isApp && this.user;
    throw Object.assign(new Error(res.status === 401 ? '로그인이 풀렸습니다. ☰ → GitHub 로그인을 다시 해 주세요'
      : send && (res.status === 403 || res.status === 404) ? (app
        ? '이 저장소에 GameTableMaker 앱이 설치돼 있지 않거나, 이 저장소에 쓸 권한이 없습니다'
        : '이 토큰에는 이 저장소에 쓸 권한이 없습니다. 토큰의 Contents 권한을 Read and write로 만들어 다시 로그인해 주세요')
      : used ? `GitHub 요청 한도를 다 썼습니다${this.user ? '' : ' (로그인 없이 시간당 60번, 로그인하면 5,000번)'}`
      : res.status === 404 ? `저장소 · 브랜치 · 폴더를 찾지 못했습니다 (${app ? '이 저장소에 GameTableMaker 앱이 설치돼 있는지 확인하세요' : '비공개 저장소면 로그인이 필요합니다'})`
      : `GitHub 오류 ${res.status}`), {status: res.status});
  }

  // 고를 수 있는 내 저장소 이름들 ('owner/repo'). GitHub로 로그인했으면 앱을 설치한 곳들, 토큰이면 토큰이 닿는 곳
  async repos() {
    const json = async url => (await this.req(url)).json();
    if (!this.isApp) return (await json(`${GITHUB_API}/user/repos?per_page=100&sort=updated`)).map(r => r.full_name);
    const {installations = []} = await json(`${GITHUB_API}/user/installations?per_page=100`);
    const lists = await Promise.all(installations.map(i => json(`${GITHUB_API}/user/installations/${i.id}/repositories?per_page=100`)));
    return lists.flatMap(l => l.repositories.map(r => r.full_name));
  }

  // 토큰이 맞으면 GitHub 사용자 정보, GitHub이 거절하면 null, 물어보지 못했으면(연결 끊김 · GitHub 오류) false
  async whoami(token) {
    try {
      const res = await fetch(`${GITHUB_API}/user`, {headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json'}, cache: 'no-store'});
      return res.ok ? await res.json() : res.status === 401 ? null : false;
    } catch { return false; }
  }

  forget() {
    Object.assign(this, {token: '', refresh: '', expires: 0, app_: false, user: null});
    try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY); } catch {}
  }

  logout() {
    this.forget();
    this.render();
    this.app.toast('GitHub에서 로그아웃했습니다');
  }

  // GitHub로 로그인: 갔다 올 때 맞춰 볼 값(state)과 로그인 유지 여부를 이 탭에 적어 두고 GitHub 허락 화면으로 간다.
  // 앱이 설치된 곳이 없으면 중간다리가 허락 다음에 바로 앱 설치 화면으로 보낸다. skip: 팀 저장소만 쓸 사람(설치 화면 건너뛰기, state 끝에 .skip)
  // 표 데이터는 고칠 때마다 저장돼 있어서 페이지를 떠나도 그대로다
  toGitHub(keep, skip) {
    const state = crypto.randomUUID() + (skip ? '.skip' : '');
    try { sessionStorage.setItem(TRIP, JSON.stringify({state, keep})); } catch {}
    location.href = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(GH_APP.clientId)}` +
      `&redirect_uri=${encodeURIComponent(location.origin + '/api/gh/callback')}&state=${state}`;
  }

  // 중간다리가 주소 # 뒤에 실어 보낸 토큰을 받는다. 새로 로그인했으면 'login', 실패 · 앱 설치 알림만이면 'info', 받은 게 없으면 false
  fromGitHub() {
    if (!location.hash.startsWith('#gh=')) return false;
    let data = {}, trip = null;
    try { data = JSON.parse(decodeURIComponent(location.hash.slice(4))); } catch {}
    try { trip = JSON.parse(sessionStorage.getItem(TRIP)); sessionStorage.removeItem(TRIP); } catch {}
    history.replaceState(null, '', location.pathname + location.search); // 주소창 · 방문 기록에 토큰을 남기지 않는다
    if (data.error) { this.app.toast('GitHub 로그인 실패\n' + data.error, 'bad'); return 'info'; }
    if (data.installed) { // 앱 설치 화면에서 설치를 마치고 왔다 (로그인은 따로)
      this.app.toast(`GameTableMaker 앱을 설치했습니다\n${this.token ? '불러오기 ▾ → GitHub에서 저장소를 고를 수 있습니다' : '☰ → GitHub 로그인 → GitHub로 로그인을 눌러 주세요'}`);
      return 'info';
    }
    if (!trip || trip.state !== data.state || !data.token) { this.app.toast('GitHub 로그인 확인 값이 맞지 않습니다. 다시 시도해 주세요', 'bad'); return 'info'; }
    Object.assign(this, {token: data.token, refresh: data.refresh || '', expires: data.expiresIn ? Date.now() + data.expiresIn * 1000 : 0, app_: true, keep: trip.keep});
    this.save();
    return 'login';
  }

  // 로그인 창. 토큰으로 로그인했으면 true, 취소하면 false (GitHub로 로그인은 페이지를 떠났다가 돌아온다)
  async login() {
    await this.config;
    const d = document.createElement('dialog'), here = location.host === LOGIN_HOST, app = !!GH_APP.clientId;
    d.className = 'popup ghimport ghlogin';
    // 긴 설명은 제목 옆 (?) 도움말에 (Help)
    const help = Help.list([
      '로그인하면 내 저장소를 목록에서 고르고, 비공개 저장소를 불러오고, GitHub에 커밋할 수 있습니다.',
      app && '<b>GitHub로 로그인</b>을 누르면 GitHub 화면으로 갑니다. <b>Authorize</b>를 누르고, 처음이면 이어서 나오는 <b>앱 설치 화면</b>에서 쓸 저장소를 고르고 Install하면 돌아옵니다.',
      app && '<b>앱 설치 없이 로그인</b>: 팀원이 초대한 저장소만 쓸 때. 그 저장소 주인이 앱을 설치해야 목록에 보입니다.',
      '<b>로그인 유지</b>를 끄면 이 탭을 닫을 때 로그아웃됩니다. 공용 PC라면 끄세요.',
    ]);
    d.innerHTML = `<form method="dialog">${Help.title('GitHub 로그인', help)}` +
      (app ? '<button type="button" class="primary big gh-app">GitHub로 로그인</button>' +
        '<p class="dim small">팀원 저장소만 쓴다면 → <button type="button" class="link gh-skip">앱 설치 없이 로그인</button></p>' : '') +
      '<label class="keep"><input type="checkbox" class="keepme" checked> 로그인 유지</label>' +
      `<details class="adv"${app ? '' : ' open'}><summary>고급: 토큰으로 로그인</summary>` +
      '<label class="asktext">토큰 <input class="token" type="password" autocomplete="off" placeholder="github_pat_로 시작하는 글자"></label>' +
      '<p class="dim small">토큰 만드는 법: <b>내 프로필 사진 → Settings</b>(저장소 Settings 아님) → Developer settings → ' +
      '<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained token</a> → ' +
      '쓸 저장소를 고르고, <b>+ Add permissions → Contents</b>를 불러오기만 하면 <b>Read-only</b>, 커밋도 하려면 <b>Read and write</b> → Generate token.</p>' +
      '<div class="btns"><button value="token" class="tokenbtn">토큰으로 로그인</button></div></details>' +
      '<p class="bad small err"></p>' +
      '<div class="btns"><button type="button" class="cancel">취소</button></div></form>';
    Help.wire(d);
    const form = d.querySelector('form'), err = d.querySelector('.err');
    let ok = false;
    d.querySelector('.cancel').onclick = () => d.close('');
    const go = skip => {
      if (!here) { err.innerHTML = `GitHub로 로그인은 <a href="https://${LOGIN_HOST}" target="_blank" rel="noopener">${LOGIN_HOST}</a>에서 됩니다`; return; }
      this.toGitHub(d.querySelector('.keepme').checked, skip);
    };
    d.querySelector('.gh-app')?.addEventListener('click', () => go(false));
    d.querySelector('.gh-skip')?.addEventListener('click', () => go(true));
    form.addEventListener('submit', async e => {
      e.preventDefault(); // 토큰이 맞는지 GitHub에 물어본 뒤에 닫는다
      const token = d.querySelector('.token').value.trim(), btn = d.querySelector('.tokenbtn');
      if (!token) { err.textContent = '토큰을 붙여넣어 주세요'; return; }
      btn.disabled = true;
      err.textContent = '';
      const user = await this.whoami(token);
      btn.disabled = false;
      if (!user) { err.textContent = '토큰이 맞지 않거나 기한이 지났습니다'; return; }
      Object.assign(this, {token, refresh: '', expires: 0, app_: false, user, keep: d.querySelector('.keepme').checked});
      this.save();
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
