import {$} from '../common/util.js';

// 지금 화면의 코드 버전. 배포할 때마다 올리고, 루트의 version.json도 같은 번호로 맞춘다
export const VERSION = '1.0.2';

// 새 버전 알림. GitHub Pages는 파일을 브라우저에 10분까지 두게 해서, 배포 직후엔 예전 코드나 옛것·새것이 섞인 화면이 보일 수 있다.
// 열 때와 탭으로 돌아올 때 version.json(캐시 안 씀)을 보고, 지금 코드와 다르면 맨 위에 띠를 띄운다.
// 띠를 누르면 이 화면이 받은 파일을 모두 새로 받아 다시 연다(그냥 새로고침은 10분 안엔 저장된 파일을 다시 쓴다).
// 표 데이터는 브라우저 저장소에 있어 다시 열어도 그대로다
export class UpdateCheck {
  constructor() {
    $('appVersion').textContent = '버전 ' + VERSION;
    this.check();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
  }

  async check() {
    try {
      const {version} = await (await fetch('version.json', {cache: 'no-store'})).json();
      if (version && version !== VERSION) this.show(version);
    } catch {} // 오프라인 등: 알림만 못 띄울 뿐
  }

  show(v) {
    if (document.querySelector('.updatebar')) return;
    const b = document.createElement('button');
    b.className = 'updatebar';
    b.textContent = `새 버전 ${v}이 나왔습니다 · 누르면 새로고침합니다 (작업한 표는 그대로입니다)`;
    b.onclick = () => this.reload();
    document.body.prepend(b);
  }

  async reload() {
    const urls = [location.href, ...performance.getEntriesByType('resource').map(e => e.name).filter(u => u.startsWith(location.origin))];
    await Promise.all(urls.map(u => fetch(u, {cache: 'reload'}).catch(() => {})));
    location.reload();
  }
}
