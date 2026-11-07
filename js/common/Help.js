// 창 제목 옆 (?) 도움말: 처음에만 필요한 긴 설명은 늘 보이지 않게 숨겨 두고, 누르면 제목 바로 아래에 펼친다(다시 누르면 접힘).
// 창 위에 또 다른 팝업을 띄우지 않아서 겹치지 않는다. 창마다 Help.title로 제목을 만들고 Help.wire(창)로 버튼을 단다
export class Help {
  // 제목 HTML. help가 있으면 오른쪽에 (?)와 숨긴 설명 상자. after: 제목 바로 아래 둘 것(어디에 · 무엇을 한 줄), 설명 상자는 그 아래
  static title(title, help, after = '') {
    if (!help) return `<h3>${title}</h3>${after}`;
    return `<h3 class="htitle">${title}<button type="button" class="helpbtn" title="도움말" aria-expanded="false">?</button></h3>` +
      `${after}<div class="helpbox" hidden>${help}</div>`;
  }

  // 설명 항목들 → 목록 HTML (빈 항목은 뺀다)
  static list(items) { return '<ul>' + items.filter(Boolean).map(i => `<li>${i}</li>`).join('') + '</ul>'; }

  static wire(d) {
    d.addEventListener('click', e => {
      const b = e.target.closest('.helpbtn');
      if (!b) return;
      const box = b.closest('form, dialog').querySelector('.helpbox'), open = box.hidden;
      box.hidden = !open;
      b.classList.toggle('on', open);
      b.setAttribute('aria-expanded', open);
    });
  }
}
