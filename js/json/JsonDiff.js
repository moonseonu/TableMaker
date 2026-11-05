// 두 JSON(GitHub에 있는 것 · 지금 표로 만든 것)의 데이터 차이. 글자 모양(들여쓰기 · 띄어쓰기)은 보지 않고 값만 본다.
// 객체 배열이면 첫 키가 ID(…ID · id)일 때 ID로, 아니면 순서로 줄을 맞춰 바뀐 칸 · 더한 줄 · 뺀 줄 · 줄 순서 · 컬럼 바뀜을 센다.
// 값 안의 띄어쓰기("Sword" → "Sword ")는 데이터라 바뀐 칸으로 센다
const show = v => v === undefined ? '(없음)' : JSON.stringify(v);

export class JsonDiff {
  // → {same, cells, add, del, order, cols, lines: ['1001 · Name: "Sword" → "Blade"', …]}
  static compare(a, b) {
    const s = JSON.stringify(a) === JSON.stringify(b);
    if (!Array.isArray(a) || !Array.isArray(b) || ![...a, ...b].every(o => o && typeof o === 'object' && !Array.isArray(o)))
      return {same: s, cells: s ? 0 : 1, add: 0, del: 0, order: false, cols: false, lines: []};
    const k = Object.keys(b[0] || a[0] || {})[0], byId = k && /id$/i.test(k);
    const key = (o, i) => byId ? show(o[k]) : String(i + 1), name = id => byId ? id.replace(/^"|"$/g, '') : id + '번째 줄';
    const A = new Map(a.map((o, i) => [key(o, i), o])), B = new Map(b.map((o, i) => [key(o, i), o]));
    const out = {same: false, cells: 0, add: 0, del: 0, order: false, cols: false, lines: []};
    for (const [id, o] of B) {
      const p = A.get(id);
      if (!p) { out.add++; out.lines.push(`+ ${name(id)}`); continue; }
      for (const f of new Set([...Object.keys(p), ...Object.keys(o)]))
        if (show(p[f]) !== show(o[f])) { out.cells++; out.lines.push(`${name(id)} · ${f}: ${show(p[f])} → ${show(o[f])}`); }
    }
    for (const id of A.keys()) if (!B.has(id)) { out.del++; out.lines.push(`− ${name(id)}`); }
    const shared = [...B.keys()].filter(id => A.has(id));
    out.order = shared.join() !== [...A.keys()].filter(id => B.has(id)).join();
    out.cols = Object.keys(a[0] || {}).join() !== Object.keys(b[0] || {}).join();
    out.same = !out.cells && !out.add && !out.del && !out.order && !out.cols;
    return out;
  }

  // 커밋 목록의 상태 글자 (예: '3칸 바뀜 · 줄 +1')
  static summary(d) {
    if (d.same) return '데이터 같음';
    return [d.cells && `${d.cells}칸 바뀜`, d.add && `줄 +${d.add}`, d.del && `줄 −${d.del}`, d.order && '줄 순서', d.cols && '컬럼 이름 · 순서']
      .filter(Boolean).join(' · ');
  }
}

// 확인: node js/json/JsonDiff.js
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('JsonDiff.js')) {
  const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  const a = [{ID: 1, Name: 'Sword', P: 1}, {ID: 2, Name: 'Bow', P: 2}, {ID: 3, Name: 'Axe', P: 3}];
  eq(JsonDiff.compare(a, structuredClone(a)).same, true);
  const d = JsonDiff.compare(a, [{ID: 1, Name: 'Sword ', P: 1}, {ID: 3, Name: 'Axe', P: 3}, {ID: 4, Name: 'Gun', P: 4}]);
  eq([d.cells, d.add, d.del, d.order], [1, 1, 1, false]);
  eq(JsonDiff.summary(d), '1칸 바뀜 · 줄 +1 · 줄 −1');
  eq(d.lines[0], '1 · Name: "Sword" → "Sword "');
  eq(JsonDiff.compare(a, [a[1], a[0], a[2]]).order, true);
  eq(JsonDiff.compare([{ID: 1, E: null}], [{ID: 1, E: ''}]).cells, 1);
  console.log('ok');
}
