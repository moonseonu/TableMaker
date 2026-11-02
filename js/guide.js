// 사용 안내(guide.html) 페이지 전용.
// 탭 줄 = 목차. 누르면 그 주제로 스크롤하고, 스크롤하면 지금 보는 주제의 탭이 켜진다.
// 주소 끝(#ref 등)으로 특정 주제를 바로 열 수 있다
const main = document.querySelector('main.guide');
const tabs = [...document.querySelectorAll('#tabs .tab')];
const mark = id => tabs.forEach(t => t.classList.toggle('on', t.dataset.topic === id));
tabs.forEach(t => t.onclick = () => {
  document.getElementById(t.dataset.topic).scrollIntoView({behavior: 'smooth', block: 'start'});
  history.replaceState(null, '', '#' + t.dataset.topic);
  mark(t.dataset.topic);
});
// 작업 영역 위쪽 30% 안에 들어온 주제를 '지금 보는 주제'로 본다
// 마지막 주제는 짧아서 위쪽까지 못 올라오니, 맨 끝에 닿으면 그것을 켠다
const atEnd = () => main.scrollTop + main.clientHeight >= main.scrollHeight - 2;
const spy = new IntersectionObserver(es => {
  if (atEnd()) return mark(tabs.at(-1).dataset.topic);
  es.forEach(e => { if (e.isIntersecting) mark(e.target.id); });
}, {root: main, rootMargin: '0px 0px -70% 0px'});
document.querySelectorAll('.topic').forEach(s => spy.observe(s));
main.addEventListener('scroll', () => { if (atEnd()) mark(tabs.at(-1).dataset.topic); });
const first = document.getElementById(location.hash.slice(1));
if (first) first.scrollIntoView({block: 'start'});
mark(first ? first.id : 'start');
