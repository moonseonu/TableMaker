// GitHub로 로그인했는데 앱 설치 화면을 거쳐서도 쓸 저장소가 없을 때의 안내 — 팀원이 초대한 저장소인 경우.
// 그 저장소는 주인이 GameTableMaker 앱을 설치해야 보이니, 주인에게 보낼 안내 글을 보여 주고 공유 · 복사하게 한다.
// (처음 쓰는 사람의 내 저장소 설치는 로그인 중간다리가 Authorize 다음에 바로 설치 화면으로 보내서 처리한다, functions/api/gh/callback.js)
// account: GitHubAccount (installUrl)
export class GitHubAppSetup {
  static invite(account) {
    return 'GameTableMaker(https://gametablemaker.pages.dev)로 우리 데이터 저장소를 같이 쓰려고 합니다.\n' +
      `아래 링크에서 GameTableMaker 앱을 설치하고, 같이 쓸 저장소만 골라 주세요.\n${account.installUrl}\n` +
      '(앱은 고른 저장소의 파일 읽기 · 쓰기만 합니다)';
  }

  static async copy(app, account) {
    try {
      await navigator.clipboard.writeText(GitHubAppSetup.invite(account));
      app.toast('주인에게 보낼 안내를 복사했습니다\n메신저 · 메일에 붙여넣어 보내세요');
    } catch {
      app.toast('복사하지 못했습니다. 이 링크를 직접 보내 주세요\n' + account.installUrl, 'warn');
    }
  }

  static show(app, account) {
    const d = document.createElement('dialog'), text = GitHubAppSetup.invite(account), canShare = !!navigator.share;
    d.className = 'popup ghsetup';
    d.innerHTML = '<form method="dialog"><h3>팀원이 초대한 저장소를 쓰시나요?</h3>' +
      '<p class="dim">그 저장소는 <b>주인이 GameTableMaker 앱을 설치</b>해야 목록에 보입니다. 아래 안내를 주인에게 보내 주세요.</p>' +
      '<textarea class="invitetext" readonly rows="5"></textarea>' +
      `<div class="sharebtns">${canShare ? '<button type="button" class="primary share">공유하기</button>' : ''}` +
      `<button type="button" class="${canShare ? '' : 'primary '}copy">복사</button></div>` +
      `<p class="dim small">내 저장소에 쓰려면 → <a href="${account.installUrl}">앱 설치하기</a></p>` +
      '<div class="btns"><button value="close">닫기</button></div></form>';
    d.querySelector('.invitetext').value = text;
    d.querySelector('.copy').onclick = () => GitHubAppSetup.copy(app, account);
    // 공유하기: 윈도우 · 휴대폰의 공유 창(카카오톡, 메일 등)으로. 취소하면 아무것도 안 한다
    d.querySelector('.share')?.addEventListener('click', () => navigator.share({title: 'GameTableMaker 앱 설치 부탁', text}).catch(() => {}));
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
  }
}
