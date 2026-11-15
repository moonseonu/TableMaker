// 연속 채우기 규칙 (엑셀의 채우기와 같게): 위에 적힌 값(seed)을 보고 그 뒤 n개를 만든다.
//   숫자: 마지막 두 값의 차이로 이어 간다(1010, 1020 → 1030…). 값이 하나면 1씩. 소수 자릿수 · 앞의 0 자릿수는 지킨다
//   끝에 숫자가 붙은 글(Item1, Item2): 앞 글자가 같으면 끝 숫자만 같은 방식으로 늘린다
//   그 밖의 글 · copy(같은 값으로 채우기): seed를 되풀이한다
// 화면과 상관없는 규칙이라 따로 두고, 아래에 자체 점검이 있다 (node js/table/grid/Series.js)
const NUM = /^-?\d+(\.\d+)?$/;

export class Series {
  static fill(seed, n, copy = false) {
    if (!seed.length || n <= 0) return [];
    if (!copy && seed.every(v => NUM.test(v.trim()))) return Series.numbers(seed.map(v => v.trim()), n);
    const tails = seed.map(v => /^(.*\D)(\d+)$/.exec(v));
    if (!copy && tails.every(m => m && m[1] === tails[0][1])) return Series.numbers(tails.map(m => m[2]), n).map(x => tails[0][1] + x);
    return Array.from({length: n}, (_, i) => seed[(seed.length + i) % seed.length]);
  }

  static step(vals) { return vals.length < 2 ? 1 : +vals[vals.length - 1] - +vals[vals.length - 2]; }

  static numbers(vals, n) {
    const step = Series.step(vals), last = vals[vals.length - 1];
    const dec = Math.max(...vals.map(v => (v.split('.')[1] || '').length));
    const pad = /^0\d/.test(last) ? last.length : 0; // 001 → 002
    return Array.from({length: n}, (_, i) => {
      const x = +last + step * (i + 1), s = dec ? x.toFixed(dec) : String(Math.round(x));
      return pad && x >= 0 ? s.padStart(pad, '0') : s;
    });
  }

  // 우클릭 메뉴에 보일 규칙 ("10씩"). 되풀이하는 글이면 ''
  static label(seed) {
    if (!seed.length) return '';
    if (seed.every(v => NUM.test(v.trim()))) return Series.step(seed) + '씩';
    const tails = seed.map(v => /^(.*\D)(\d+)$/.exec(v));
    return tails.every(m => m && m[1] === tails[0][1]) ? Series.step(tails.map(m => m[2])) + '씩' : '';
  }
}

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('Series.js')) {
  const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  eq(Series.fill(['1010', '1020'], 3), ['1030', '1040', '1050']);
  eq(Series.fill(['1001'], 2), ['1002', '1003']);
  eq(Series.fill(['0.1', '0.2'], 2), ['0.3', '0.4']);
  eq(Series.fill(['001'], 2), ['002', '003']);
  eq(Series.fill(['Item1', 'Item3'], 2), ['Item5', 'Item7']);
  eq(Series.fill(['Lv_09'], 2), ['Lv_10', 'Lv_11']);
  eq(Series.fill(['검', '활'], 3), ['검', '활', '검']);
  eq(Series.fill(['1010', '1020'], 2, true), ['1010', '1020']);
  eq(Series.fill([], 2), []);
  eq(Series.label(['1010', '1020']), '10씩');
  eq(Series.label(['검']), '');
  console.log('ok');
}
