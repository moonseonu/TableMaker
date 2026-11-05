// GitHub로 로그인 — GitHub이 로그인 뒤 돌려보내는 곳 (Cloudflare Pages Functions: /api/gh/callback).
// 받은 일회용 code를 앱 비밀 키와 함께 GitHub에 보내 로그인 토큰으로 바꾸고, 사이트로 돌려보낸다.
// 토큰은 주소의 # 뒤(서버에 안 가는 부분)에 실어 보내고, 사이트(GitHubAccount)가 읽은 뒤 바로 지운다.
// 저장하는 것은 없다. 비밀 키는 Cloudflare Pages 설정의 GITHUB_CLIENT_SECRET에만 있다(코드 · 저장소에는 없음)
export async function onRequestGet({request, env}) {
  const url = new URL(request.url), code = url.searchParams.get('code'), state = url.searchParams.get('state') || '';
  const back = data => Response.redirect(`${url.origin}/#gh=${encodeURIComponent(JSON.stringify({...data, state}))}`, 302);
  if (!code) return back({error: url.searchParams.get('error_description') || '로그인을 취소했습니다'});
  // 앱 설치 링크로 설치를 마치고 온 경우: 사이트가 보낸 확인 값(state)이 없으니 토큰은 바꾸지 않고 '설치 완료'만 알린다
  // (남이 만든 링크로 엉뚱한 계정에 로그인되는 일을 막으려고, 로그인은 늘 사이트의 'GitHub로 로그인'에서 시작한다)
  if (!state) return back({installed: true});
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify({client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code}),
  });
  const t = await res.json();
  if (!t.access_token) return back({error: t.error_description || 'GitHub 로그인에 실패했습니다'});
  // 처음 쓰는 사람: 앱이 설치된 곳이 하나도 없으면 사이트를 거치지 않고 바로 GitHub 앱 설치 화면으로 보낸다
  // (같은 state를 실어 보내서, 설치를 마치면 GitHub이 code와 함께 여기로 다시 보낸다 → 그때 로그인을 마친다).
  // 팀원이 초대한 저장소만 쓰는 사람은 로그인 창에서 '설치 건너뛰기'를 골라 state 끝에 .skip이 붙어 온다
  if (!state.endsWith('.skip') && await installCount(t.access_token) === 0)
    return Response.redirect(`https://github.com/apps/${env.GITHUB_APP_SLUG || 'gametablemaker'}/installations/new?state=${encodeURIComponent(state)}`, 302);
  return back({token: t.access_token, refresh: t.refresh_token || '', expiresIn: t.expires_in || 0});
}

// 이 사람이 쓸 수 있는 앱 설치 수 (내 계정 · 조직 · 협업 중인 저장소의 주인이 설치한 것). 못 물어보면 1로 봐서 그냥 로그인시킨다
async function installCount(token) {
  try {
    const res = await fetch('https://api.github.com/user/installations?per_page=1', {
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'GameTableMaker'},
    });
    return res.ok ? (await res.json()).total_count : 1;
  } catch { return 1; }
}
