// GitHub로 로그인한 토큰 이어 가기 (Cloudflare Pages Functions: POST /api/gh/refresh, body {refresh}).
// GitHub App 로그인 토큰은 8시간이면 끝나서, 사이트가 끝나기 전에 refresh 토큰으로 새 토큰을 받는다(비밀 키가 필요해 여기서).
// 같은 사이트에서만 부른다(다른 주소에서 온 요청은 거절)
export async function onRequestPost({request, env}) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return new Response('forbidden', {status: 403});
  const {refresh} = await request.json().catch(() => ({}));
  if (!refresh) return Response.json({error: 'refresh 토큰이 없습니다'}, {status: 400});
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify({client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: refresh}),
  });
  const t = await res.json();
  if (!t.access_token) return Response.json({error: t.error_description || '다시 로그인해 주세요'}, {status: 401});
  return Response.json({token: t.access_token, refresh: t.refresh_token || '', expiresIn: t.expires_in || 0});
}
