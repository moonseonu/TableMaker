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
  return back({token: t.access_token, refresh: t.refresh_token || '', expiresIn: t.expires_in || 0});
}
