// 브라우저 저장 공간(localStorage, 이 사이트 전체에 글자 약 500만 자)이 꽉 차 저장이 안 될 때 알린다.
// 저장은 프로젝트를 통째로 다시 쓰기 때문에 한 번 넘치면 크기가 줄 때까지 계속 실패한다(마지막으로 저장된 것은 그대로 남는다).
// 팝업은 넘친 뒤 한 번만(고칠 때마다 뜨지 않게). 넘친 동안 새로고침 · 창 닫기는 브라우저가 "나갈까요?"를 묻는다.
// 다시 저장되면 풀리고, 또 넘치면 다시 알린다.
// ponytail: 넘치는 사람이 생기면(연락이 오면) 저장을 IndexedDB(훨씬 큼)로 옮긴다
const ISSUE = 'https://github.com/moonseonu/TableMaker/issues/new?title=' + encodeURIComponent('저장 공간이 부족해요');
const stay = e => e.preventDefault();

export class StorageFull {
  static exportZip = null; // 프로젝트 zip 받기 (App이 넣는다)
  static full = false;

  static isFull(e) { return e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22; }

  static saved() {
    if (!StorageFull.full) return;
    StorageFull.full = false;
    removeEventListener('beforeunload', stay);
  }

  static failed(e) {
    if (!StorageFull.isFull(e) || StorageFull.full) return;
    StorageFull.full = true;
    addEventListener('beforeunload', stay);
    const d = document.createElement('dialog');
    d.className = 'popup storagefull';
    d.innerHTML = '<form method="dialog"><h3>브라우저 저장 공간이 꽉 찼습니다</h3>' +
      '<p class="dim">방금 고친 내용이 이 브라우저에 <b>저장되지 않았습니다</b>. 화면의 내용은 그대로 있지만, 새로고침하거나 창을 닫으면 마지막으로 저장된 때로 돌아갑니다.</p>' +
      '<p class="dim">지금 <b>프로젝트 전체를 zip으로 받아</b> 두세요. 안 쓰는 프로젝트나 테이블을 지우면 다시 저장됩니다.</p>' +
      `<p class="dim">이만큼 큰 프로젝트를 쓰신다면 <a href="${ISSUE}" target="_blank" rel="noopener">알려 주세요</a>. 더 큰 저장 공간을 쓰도록 업데이트하겠습니다.</p>` +
      '<div class="btns"><button type="button" class="cancel">닫기</button><button value="zip" class="primary" autofocus>zip으로 받기</button></div></form>';
    d.querySelector('.cancel').onclick = () => d.close('');
    d.addEventListener('close', () => { d.remove(); if (d.returnValue === 'zip') StorageFull.exportZip?.(); });
    document.body.append(d);
    d.showModal();
  }
}
