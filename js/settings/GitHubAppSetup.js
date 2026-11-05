// GitHub로 로그인했는데 GameTableMaker 앱이 설치된 저장소가 하나도 없을 때의 안내 (처음 쓰는 사람용).
// 내 저장소면 바로 앱 설치 화면으로(설치를 마치면 사이트로 돌아온다, GitHubAccount.fromGitHub),
// 팀 저장소면 저장소 주인이 설치해야 하니 주인에게 보낼 안내 글을 복사해 준다.
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
      app.toast('저장소 주인에게 보낼 안내를 복사했습니다\n메신저 · 메일에 붙여넣어 보내세요');
    } catch {
      app.toast('복사하지 못했습니다. 이 링크를 직접 보내 주세요\n' + account.installUrl, 'warn');
    }
  }

  static show(app, account) {
    const d = document.createElement('dialog');
    d.className = 'popup ghsetup';
    d.innerHTML = '<form method="dialog"><h3>아직 GameTableMaker를 쓸 저장소가 없습니다</h3>' +
      '<p class="dim">GitHub로 로그인하면 <b>GameTableMaker 앱이 설치된 저장소</b>만 불러오고 커밋할 수 있습니다.</p>' +
      '<div class="way"><b>내 저장소라면</b><p class="dim">설치 화면에서 쓸 저장소를 고르면 다시 돌아옵니다.</p>' +
      '<button type="button" class="primary install">앱 설치하기</button></div>' +
      '<div class="way"><b>팀 저장소라면</b><p class="dim">저장소 주인이 설치해야 합니다. 설치 링크가 든 안내를 복사해 보내세요.</p>' +
      '<button type="button" class="invite">주인에게 보낼 안내 복사</button></div>' +
      '<div class="btns"><button value="later">나중에</button></div></form>';
    d.querySelector('.install').onclick = () => { location.href = account.installUrl; }; // 표는 고칠 때마다 저장돼 있어 떠나도 된다
    d.querySelector('.invite').onclick = () => GitHubAppSetup.copy(app, account);
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
  }
}
