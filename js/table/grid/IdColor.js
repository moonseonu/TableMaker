// ID 첫 자리로 색 구분: 게임 ID는 보통 첫 자리로 종류를 나눠서(1xxx 씨앗 · 8xxx 업그레이드 …) 그 자리마다 색을 정해
// ID 칸 가장자리에 얇은 띠로 칠한다(가로 보기는 왼쪽, 세로 보기는 위). 배경은 그대로라 빨간 오류 · 노란 경고 칸과 겹치지 않는다.
// 앞의 0은 빼고 본다(001 → 1, JSON에는 정수로 나가니까). ID가 0이거나 숫자가 아니면 칠하지 않는다.
// 색은 고정 9색(css의 --d1~--d9), 이웃한 자리끼리 계열이 겹치지 않는 순서. 빨강 · 노랑은 오류 · 경고 색이라 뺐다.
// 테이블마다 ID ⚙에서 켜고 끈다(table.digitColor, 기본 켜짐). 화면만 바뀌고 JSON에는 영향이 없다.
// ponytail: 색은 못 바꾼다. 다른 색을 쓰고 싶다는 요청이 오면 자리마다 색을 고르는 선택기를 ⚙ 옆에 띄운다
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class IdColor {
  // ID 값 → 첫 자리(1~9), 칠하지 않으면 ''
  idDigit(v) { return /^\d+$/.test(v) && +v > 0 ? String(+v)[0] : ''; }

  // paint가 칸마다 부른다 (값을 고치면 바로 색이 바뀐다)
  paintIdColor(td, v) {
    const d = this.t.digitColor !== false && this.idDigit(v);
    if (d) td.dataset.d = d; else delete td.dataset.d;
  }

  // 값을 고치면 ⚙ 안의 동그라미도 이 표에 있는 자리 · 없는 자리를 다시 맞춘다 (paint 끝에서)
  markDigits() {
    const used = new Set(this.t.rows.map(r => this.idDigit(r[0])));
    this.el.querySelectorAll('.idopt .digit').forEach(s => s.classList.toggle('unused', !used.has(s.textContent)));
  }

  // ID ⚙ 안: 켜기 체크 + 1~9가 어느 색인지 보여 주는 동그라미(누를 수 없음, 5개 · 4개 두 줄). 이 표에 없는 자리는 테두리만.
  // 꺼도 동그라미는 흐리게 남겨 두어 설정 창 크기가 바뀌지 않게
  idColorOpt() {
    const t = this.t, on = t.digitColor !== false, used = new Set(t.rows.map(r => this.idDigit(r[0])));
    return `<label title="ID 첫 자리마다 색을 정해 ID 칸에 얇은 띠로 보여 줍니다(화면만, JSON에는 영향 없음)"><input type="checkbox" class="digitcolor"${on ? ' checked' : ''}> 첫 자리로 색 구분</label>` +
      `<div class="digits${on ? '' : ' off'}">` + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(d =>
        `<span class="digit${used.has(String(d)) ? '' : ' unused'}" style="--dc:var(--d${d})" title="${d}로 시작하는 ID${used.has(String(d)) ? '' : ' (이 표에는 없음)'}">${d}</span>`).join('') + '</div>';
  }
}
