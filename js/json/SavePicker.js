import {esc} from '../common/util.js';
import {CheckPicker} from '../common/CheckPicker.js';
import {Help} from '../common/Help.js';

// 파일 저장 ▾ → JSON… / 설명서… 에서 저장할 탭을 고르는 창 (체크박스 표, CheckPicker).
// 처음엔 지금 보고 있는 탭만 체크(하나만 저장할 때는 바로 '저장').
// items: [{name, size, errors}] → 고른 번호 배열, 취소하면 null
export class SavePicker {
  static pick(title, items, cur, showErrors) {
    return CheckPicker.pick({
      title: esc(title), help: Help.list(['저장할 탭을 고르세요. 하나면 파일 하나로, 여러 개면 zip 하나로 받습니다.']), ok: '저장',
      heads: ['테이블', '크기', ...(showErrors ? ['오류'] : [])],
      rows: items.map(it => [`<b>${esc(it.name)}</b>`, it.size, ...(showErrors ? [it.errors ? `<span class="bad">${it.errors}개</span>` : ''] : [])]),
      checked: items.map((_, i) => i === cur),
    });
  }
}
