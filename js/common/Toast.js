// 잠깐 떴다가 흐려지며 사라지는 알림 (불러오기 결과, 되돌릴 것 없음 등 한 번 알리면 되는 것).
// 늘 보여야 하는 오류·경고 수는 툴바의 상태줄(App.status)에 둔다.
// kind: '' · 'warn' · 'bad'. 경고·실패는 읽을 시간을 더 준다. 마우스를 올리면 멈추고, 누르면 바로 닫힌다
export class Toast {
  static show(text, kind = '') {
    document.querySelector('.toast')?.remove(); // 하나씩만
    const el = Object.assign(document.createElement('div'), {className: `toast ${kind}`, textContent: text, title: '눌러서 닫기'});
    el.style.setProperty('--dur', kind ? '7s' : '3s');
    el.onclick = el.onanimationend = () => el.remove();
    document.body.append(el);
  }
}
