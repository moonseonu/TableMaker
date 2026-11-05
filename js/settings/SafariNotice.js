// Safari(Mac · iPhone · iPad)는 사이트를 Safari를 쓴 날로 7일 동안 열지 않으면 그 사이트가 브라우저에 저장한 데이터를 지울 수 있다(Apple 개인정보 보호 정책).
// 사이트 쪽에서 끌 방법이 없어서, Safari에서는 지금 프로젝트를 받아 둔 지(zip 저장 · GitHub 커밋) 3일이 지나면 열 때 알려 준다(하루에 한 번까지).
// 받아 둔 때는 프로젝트마다 projects 목록에 backupAt으로 남긴다. 처음 보는 프로젝트는 그때부터 센다.
// iPhone · iPad에서 홈 화면에 추가해 연 웹 앱(navigator.standalone)은 이 규칙이 적용되지 않아 알리지 않는다
const DAY = 864e5, AFTER = 3 * DAY, TOLD = 'tablemaker.safariTold';

export class SafariNotice {
  // 크롬 · 엣지 · 오페라 · 안드로이드는 WebKit 글자가 있어도 빼고, iPhone의 다른 브라우저(CriOS 등)는 WebKit이라 넣는다
  static isSafari(ua = navigator.userAgent) { return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua); }

  constructor(app) {
    this.app = app;
    if (!SafariNotice.isSafari() || navigator.standalone || app.projects.fresh) return;
    const p = app.projects.current, now = Date.now();
    if (!p.backupAt) { p.backupAt = now; app.projects.save(); return; }
    let told = 0;
    try { told = +localStorage.getItem(TOLD) || 0; } catch {}
    if (now - p.backupAt > AFTER && now - told > DAY) this.show(Math.floor((now - p.backupAt) / DAY));
  }

  // 프로젝트를 밖에 받아 둠 (Exporter의 프로젝트 zip, GitHubCommit 성공)
  backedUp() {
    this.app.projects.current.backupAt = Date.now();
    this.app.projects.save();
  }

  show(days) {
    try { localStorage.setItem(TOLD, String(Date.now())); } catch {}
    const gh = !!this.app.projects.current.link, d = document.createElement('dialog');
    d.className = 'popup storagefull';
    d.innerHTML = `<form method="dialog"><h3>${days}일 동안 받아 두지 않았습니다</h3>` +
      '<p class="dim">Safari는 이 사이트를 <b>7일 동안 열지 않으면</b> 브라우저에 저장된 표를 지울 수 있습니다(Apple의 개인정보 보호 정책). 크롬 · 엣지에는 이런 규칙이 없습니다.</p>' +
      `<p class="dim">${gh ? '<b>GitHub에 커밋</b>하거나 ' : ''}<b>프로젝트 전체를 zip으로</b> 받아 두면 지워져도 다시 불러올 수 있습니다. iPhone · iPad는 <b>공유 → 홈 화면에 추가</b>로 열면 이 규칙이 적용되지 않습니다.</p>` +
      `<div class="btns"><button type="button" class="cancel">닫기</button><button value="ok" class="primary" autofocus>${gh ? 'GitHub에 커밋' : 'zip으로 받기'}</button></div></form>`;
    d.querySelector('.cancel').onclick = () => d.close('');
    d.addEventListener('close', () => {
      d.remove();
      if (d.returnValue === 'ok') gh ? this.app.githubCommit.open() : this.app.exporter.save('project');
    });
    document.body.append(d);
    d.showModal();
  }
}
