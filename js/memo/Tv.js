import {$, esc} from '../common/util.js';

const KEY = 'tablemaker.tv';

// 오른쪽 여백의 TV (재미로 넣은 기능). 메모 칸 제목줄의 TV 버튼 → 창에 유튜브 주소를 넣으면 메모장 위에 16:9 영상 칸이 생겨 재생된다.
// 브라우저 PiP 창이 메모를 가리는 대신 자리를 따로 둔 것. 켜기 전에는 유튜브를 전혀 불러오지 않고, 쿠키를 덜 남기는 youtube-nocookie 주소로 튼다.
// 마지막 주소만 이 브라우저에 기억한다(다시 열면 창에 채워 둠, 새로고침하면 꺼진 채로). 퍼가기를 막은 영상은 유튜브가 재생을 막는다
export class Tv {
  // 유튜브 주소(또는 영상 ID 11자) → {id, start}. watch?v= · youtu.be/ · shorts/ · live/ · embed/, 시작 시간 t=90 · 1m30s. 아니면 null
  static parse(s) {
    s = s.trim();
    if (/^[\w-]{11}$/.test(s)) return {id: s, start: 0};
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
    const h = u.hostname.replace(/^(www|m|music)\./, '');
    const id = h === 'youtu.be' ? u.pathname.split('/')[1]
      : /^youtube(-nocookie)?\.com$/.test(h) ? u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/) || [])[1] : null;
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    const m = (u.searchParams.get('t') || u.searchParams.get('start') || '').match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    return {id, start: m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0};
  }

  constructor() {
    this.box = $('tv');
    this.btn = $('tvBtn');
    this.btn.addEventListener('click', () => this.ask());
  }

  // 주소를 받는 창. 틀고 있으면 끄기 버튼도
  ask() {
    let last = '';
    try { last = localStorage.getItem(KEY) || ''; } catch {}
    const on = !this.box.hidden, d = document.createElement('dialog');
    d.className = 'popup';
    d.innerHTML = '<form method="dialog"><h3>TV</h3>' +
      `<label class="asktext">유튜브 주소 <input value="${esc(last)}" placeholder="https://www.youtube.com/watch?v=…" autofocus></label>` +
      '<p class="tverr" hidden></p><p class="dim tvnote">메모장 위에 작게 틀어 둡니다. 퍼가기를 막은 영상은 재생되지 않습니다.</p>' +
      `<div class="btns"><button type="button" class="cancel">취소</button>${on ? '<button type="button" class="tvoff">끄기</button>' : ''}<button value="ok" class="primary">틀기</button></div></form>`;
    const inp = d.querySelector('input'), err = d.querySelector('.tverr');
    d.querySelector('.cancel').onclick = () => d.close('');
    if (on) d.querySelector('.tvoff').onclick = () => { this.off(); d.close(''); };
    inp.addEventListener('input', () => { err.hidden = true; });
    d.querySelector('form').addEventListener('submit', e => {
      const v = Tv.parse(inp.value);
      if (!v) {
        e.preventDefault();
        err.textContent = inp.value.trim() ? '유튜브 영상 주소가 아닙니다. 영상 페이지의 주소를 붙여 넣으세요' : '유튜브 주소를 넣으세요';
        err.hidden = false;
        return;
      }
      try { localStorage.setItem(KEY, inp.value.trim()); } catch {}
      this.play(v);
    });
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
    inp.select();
  }

  play({id, start}) {
    this.box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start ? '&start=' + start : ''}" title="TV"` +
      ' allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    this.box.hidden = false;
    this.btn.classList.add('on');
  }

  off() {
    this.box.innerHTML = ''; // 영상과 소리를 멈춘다
    this.box.hidden = true;
    this.btn.classList.remove('on');
  }
}

// node js/memo/Tv.js → 주소 읽기 확인
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('Tv.js')) {
  const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  const id = 'dQw4w9WgXcQ';
  eq(Tv.parse(`https://www.youtube.com/watch?v=${id}`), {id, start: 0});
  eq(Tv.parse(`youtu.be/${id}?t=90`), {id, start: 90});
  eq(Tv.parse(`https://m.youtube.com/watch?v=${id}&t=1m30s`), {id, start: 90});
  eq(Tv.parse(`https://www.youtube.com/shorts/${id}`), {id, start: 0});
  eq(Tv.parse(`https://www.youtube.com/live/${id}?si=x`), {id, start: 0});
  eq(Tv.parse(id), {id, start: 0});
  eq(Tv.parse('https://example.com/watch?v=' + id), null);
  eq(Tv.parse('아무 글자'), null);
  console.log('ok');
}
