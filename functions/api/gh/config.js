// GitHub로 로그인에 필요한 공개 값 (Cloudflare Pages Functions: GET /api/gh/config).
// Client ID는 Cloudflare Pages 설정의 GITHUB_CLIENT_ID에서 읽어 준다(사이트 코드에 옮겨 적지 않아도 되게).
// 비밀 키(GITHUB_CLIENT_SECRET)는 여기서 내보내지 않는다
export function onRequestGet({env}) {
  return Response.json({clientId: env.GITHUB_CLIENT_ID || '', ready: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)},
    {headers: {'Cache-Control': 'no-store'}});
}
