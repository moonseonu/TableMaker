import {esc, ask} from '../../common/util.js';

// String 열 번역해서 채우기: 타입 옆 문A 아이콘 → 번역기 · 원문 열 → 언어를 고르고 이 열의 모든 칸을 번역으로 채운다.
// 번역기는 지금 브라우저 내장 번역(Chrome의 Translator API, 무료 · PC 안에서 번역)뿐이다. 나중에 AI 번역을 같은 칸에 더한다.
// 원문 언어는 원문 열의 글을 보고 알아낸다(Chrome LanguageDetector, 없으면 글자 모양으로). 이미 적힌 칸이 있으면 덮어쓰기 전에 묻는다.
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
const ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h7M9 3v2c0 4.418-2.239 8-5 8M5 9c0 2.144 2.952 3.908 6.7 4"/><path d="M12 20l4-9 4 9M19.1 18h-6.2"/></svg>';
const LANGS = ['ko', 'en', 'ja', 'zh', 'zh-Hant', 'es', 'fr', 'de', 'pt', 'ru', 'it', 'vi', 'th', 'id', 'tr', 'ar'];
// 열 이름으로 언어 짐작 (English → en)
const NAMES = {ko: /kor|^ko$|한국/i, en: /eng|^en$|영어/i, ja: /jap|jpn|^ja$|일본/i, 'zh-Hant': /hant|tw|번체/i, zh: /chi|^zh|^cn$|중국/i, es: /spa|^es$/i, fr: /fre|fra|^fr$/i, de: /ger|deu|^de$/i,
  pt: /por|^pt/i, ru: /rus|^ru$/i, it: /ita|^it$/i, vi: /viet|^vi$/i, th: /thai|^th$/i, id: /indo|^id$/i, tr: /turk|^tr$/i, ar: /arab|^ar$/i};
const langName = code => { try { return new Intl.DisplayNames(['ko'], {type: 'language'}).of(code); } catch { return code; } };
const byName = name => Object.keys(NAMES).find(k => NAMES[k].test(name || ''));

export class ColumnTranslate {
  translateHead(c, i) {
    if (c.type !== 'string' || c.id || c.linked || this.t.locked) return '';
    return `<details class="opt tropt" data-c="${i}"><summary class="ico" title="다른 열을 번역해서 이 열 채우기">${ICON}</summary><div class="pop"></div></details>`;
  }

  // 열 때마다 지금 열들로 창을 채운다
  onTranslateToggle(e) {
    const d = e.target;
    if (d.open && d.classList.contains('tropt') && !d.busy) this.fillTranslate(d);
  }

  fillTranslate(d) {
    const t = this.t, i = +d.dataset.c, col = t.cols[i], pop = d.querySelector('.pop');
    const srcs = t.cols.map((c, k) => k).filter(k => k !== i && t.cols[k].type === 'string' && !t.cols[k].id);
    if (!srcs.length) { pop.innerHTML = '<span class="dim">번역할 원문 열(String)이 없습니다</span>'; return; }
    const to = byName(col.name) || 'en';
    // 원문: 이름이 다른 언어를 가리키고 값이 있는 열을 먼저
    const src = srcs.find(k => byName(t.cols[k].name) && byName(t.cols[k].name) !== to && this.filled(k)) ?? srcs.find(k => this.filled(k)) ?? srcs[0];
    pop.innerHTML = `<b>${esc(col.name || '(이름 없음)')} 열 번역해서 채우기</b>` +
      '<label>번역기 <select class="trby"><option>브라우저 내장 번역 (무료)</option></select></label>' +
      `<label>원문 <select class="trsrc">${srcs.map(k => `<option value="${k}"${k === src ? ' selected' : ''}>${esc(t.cols[k].name || '(이름 없음)')} 열</option>`).join('')}</select>` +
      `→ <select class="trto">${LANGS.map(l => `<option value="${l}"${l === to ? ' selected' : ''}>${esc(langName(l))}</option>`).join('')}</select></label>` +
      '<span class="dim small trfrom"></span><span class="bad small trerr"></span>' +
      '<div class="btns"><button type="button" class="primary trgo"></button></div>';
    // 표의 입력 · 키 · 고르기 처리에 섞이지 않게 창 안의 일은 여기서 끝낸다
    for (const ev of ['input', 'change', 'compositionend', 'keydown', 'mousedown', 'dblclick', 'focusin', 'focusout']) pop.addEventListener(ev, e => e.stopPropagation());
    pop.addEventListener('change', () => this.trRefresh(d));
    pop.querySelector('.trgo').onclick = () => this.runTranslate(d);
    this.trRefresh(d);
  }

  filled(k) { return this.t.rows.some(r => (r[k] || '').trim()); }

  // 원문 열이 바뀌면: 번역할 칸 수와 원문 언어를 다시
  async trRefresh(d) {
    const t = this.t, pop = d.querySelector('.pop'), k = +pop.querySelector('.trsrc').value;
    const n = t.rows.filter(r => (r[k] || '').trim()).length, go = pop.querySelector('.trgo');
    go.textContent = `번역 (${n}칸)`;
    go.disabled = !n;
    pop.querySelector('.trerr').textContent = '';
    const from = pop.querySelector('.trfrom');
    from.textContent = n ? '원문 언어를 알아보는 중…' : '원문 열이 비어 있습니다';
    if (!n) return;
    d.from = await this.detect(t.rows.map(r => r[k]).filter(v => (v || '').trim()).slice(0, 30).join('\n'), t.cols[k].name);
    from.textContent = d.from ? `${t.cols[k].name} 열은 ${langName(d.from)}로 알아봤습니다` : '원문 언어를 알아내지 못했습니다';
  }

  // 원문 언어: Chrome 언어 감지가 있으면 그걸로, 없으면 열 이름 · 글자 모양(한글 · 가나 · 한자 · 로마자)으로
  async detect(text, name) {
    try {
      if ('LanguageDetector' in self) {
        const [top] = await (await LanguageDetector.create()).detect(text);
        if (top && top.detectedLanguage !== 'und' && top.confidence > 0.5) return top.detectedLanguage;
      }
    } catch {}
    return byName(name) || (/[가-힣]/.test(text) ? 'ko' : /[ぁ-ゟ゠-ヿ]/.test(text) ? 'ja' : /[一-鿿]/.test(text) ? 'zh' : /[a-z]/i.test(text) ? 'en' : '');
  }

  async runTranslate(d) {
    const t = this.t, i = +d.dataset.c, pop = d.querySelector('.pop'), err = pop.querySelector('.trerr'), go = pop.querySelector('.trgo');
    const k = +pop.querySelector('.trsrc').value, to = pop.querySelector('.trto').value, from = d.from;
    const fail = m => { d.busy = false; err.textContent = m; go.disabled = false; go.textContent = '다시 번역'; };
    if (!('Translator' in self)) return fail('브라우저 내장 번역은 Chrome(PC, 138 이상)에서 쓸 수 있습니다');
    if (!from) return fail('원문 언어를 알아내지 못했습니다');
    if (from === to) return fail('원문과 같은 언어입니다');
    const rows = t.rows.map((r, ri) => ri).filter(ri => (t.rows[ri][k] || '').trim());
    const full = rows.filter(ri => t.rows[ri][i] !== '').length;
    if (full && !await ask('이미 적힌 칸이 있습니다', `${t.cols[i].name} 열 ${rows.length}칸 중 ${full}칸에 값이 있습니다. 모두 새로 번역해서 덮어쓸까요? (Ctrl+Z로 되돌릴 수 있습니다)`, '덮어쓰기')) return;
    d.busy = true; // 경고 창을 누르면 바깥 클릭으로 닫혀서 다시 연다(진행 상황을 보이게, 창 내용은 그대로)
    d.open = true;
    go.disabled = true;
    err.textContent = '';
    try {
      const pair = {sourceLanguage: from, targetLanguage: to};
      if (await Translator.availability(pair) === 'unavailable') return fail(`${langName(from)} → ${langName(to)} 번역은 아직 지원하지 않습니다`);
      go.textContent = '준비 중…';
      const tr = await Translator.create({...pair, monitor: m => m.addEventListener('downloadprogress', e => go.textContent = `언어 파일 받는 중 ${Math.round(e.loaded * 100)}%`)});
      const done = new Map(); // 같은 글은 한 번만
      for (const [n, ri] of rows.entries()) {
        go.textContent = `번역 중 ${n + 1}/${rows.length}`;
        const v = t.rows[ri][k];
        if (!done.has(v)) done.set(v, await tr.translate(v));
        t.rows[ri][i] = done.get(v);
      }
    } catch (e) {
      return fail('번역하지 못했습니다 · ' + (e.message || e));
    }
    d.busy = false;
    d.open = false;
    if (t === this.t) this.render(); // 다시 그리면서 저장 · 되돌리기 기록(Ctrl+Z 한 번에 전부)
    else this.app.commit();
    this.app.toast(`${t.cols[i].name} 열 ${rows.length}칸을 번역했습니다 · 기계 번역이니 한 번 확인해 주세요`);
  }
}
