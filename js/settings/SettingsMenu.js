import {$} from '../common/util.js';

const KEY = 'tablemaker.theme';

// 제목 줄 오른쪽 ☰ 메뉴: 화면 테마처럼 한 번 정하면 잘 안 바꾸는 설정.
// 테마는 <html data-theme>로 정하고 색은 css/style.css 맨 위 변수가 바꾼다. '시스템 설정 따름'은 data-theme를 비운다.
// 첫 화면에서 깜빡이지 않게 저장된 테마는 index.html <head>에서 먼저 적용한다
export class SettingsMenu {
  constructor() {
    this.menu = $('appMenu');
    this.menu.querySelector('.menu').onclick = e => {
      const b = e.target.closest('[data-theme-pick]');
      if (b) this.setTheme(b.dataset.themePick);
    };
    this.mark();
  }

  get theme() {
    try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
  }

  setTheme(t) {
    try { t === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t); } catch {}
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    this.mark();
  }

  mark() {
    const t = this.theme;
    this.menu.querySelectorAll('[data-theme-pick]').forEach(b => b.classList.toggle('on', b.dataset.themePick === t));
  }
}
