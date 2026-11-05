import {$, ask} from '../common/util.js';

// 후원 받을 링크(카카오페이 송금코드). 비어 있으면 실제 사이트에서는 ☰ 메뉴의 후원 버튼을 숨긴다 (localhost에서는 확인용으로 보인다)
const DONATE_URL = 'https://qr.kakaopay.com/FdjS44LQo';
// 같은 링크의 QR 코드. 링크를 바꾸면 다시 만든다 (segno로 한 번 만들어 둔 파일)
const QR_IMG = 'img/donate-qr.svg';
// 송금 화면에는 받는 사람 실명이 떠서, 낯설지 않게 QR 창에서 미리 초성으로 알려 준다
const PAYEE = "카카오페이 송금 화면의 받는 사람 이름은 초성으로 'ㅁㅅㅇ'입니다.";

// ☰ 메뉴의 커피 후원. 바로 보내지 않고 "진짜요?"를 한 번 묻는다. 네 →
// 휴대폰은 링크를 바로 열고, PC는 QR 코드를 보여 준다 (카카오페이 송금코드는 PC 브라우저에서 404라 휴대폰으로 찍어야 열린다)
export class Donate {
  constructor() {
    const b = $('donate');
    b.hidden = !DONATE_URL && location.hostname !== 'localhost';
    b.onclick = async () => {
      $('appMenu').open = false;
      if (!await ask('진짜요?', 'GameTableMaker는 무료이고, 후원하지 않아도 모든 기능을 그대로 쓸 수 있어요.', '네', 'primary', '아니요') || !DONATE_URL) return;
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) window.open(DONATE_URL, '_blank', 'noopener');
      else this.showQr();
    };
  }

  showQr() {
    const d = document.createElement('dialog');
    d.className = 'popup donate';
    d.innerHTML = '<form method="dialog"><h3>휴대폰 카메라로 찍어 주세요</h3>' +
      `<img src="${QR_IMG}" alt="카카오페이 송금 QR 코드" width="198" height="198">` +
      `<p class="dim">카카오페이 송금 화면이 열려요. 고맙습니다 ☕<br>${PAYEE}</p>` +
      '<div class="btns"><button class="primary">닫기</button></div></form>';
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
  }
}
