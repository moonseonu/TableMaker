// JSON 파일의 글자 모양(들여쓰기 · 콜론 앞뒤 띄움 · 줄바꿈 · 끝 줄바꿈)을 기억해 같은 모양으로 쓴다.
// 데이터가 같으면 파일 글자도 같아서 GitHub 커밋 목록에 안 나오고, 고친 줄만 GitHub 변경으로 보인다.
// 불러온 JSON은 그 파일의 모양(Table.fmt), 여기서 만든 표는 기본 모양(2칸, ": ", 끝 줄바꿈 없음 — 예전부터 쓰던 모양)
// dot: 정수 값도 1.0처럼 소수점을 붙여 쓰던 컬럼들 (Unity 등이 Float을 이렇게 쓴다)
// ponytail: 유니코드 이스케이프 · 지수 표기 같은 값 글자 모양과 BOM은 못 지킨다. 그런 파일이 나오면 값 원문을 들고 있게
export class JsonFormat {
  static DEFAULT = {indent: '  ', colon: ': ', eol: '\n', end: '', dot: []};

  // 파일 글자 → 모양. 줄바꿈이 없으면 한 줄짜리(indent '')
  static detect(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const ind = /\n([ \t]+)\S/.exec(text), col = /"(?:[^"\\]|\\.)*"([ \t]*:[ \t]*)/.exec(text);
    const dot = [...new Set([...text.matchAll(/"((?:[^"\\]|\\.)*)"[ \t]*:[ \t]*-?\d+\.0+(?=[\s,}\]])/g)].map(m => JSON.parse(`"${m[1]}"`)))];
    return {indent: text.includes('\n') ? ind ? ind[1] : '' : '', colon: col ? col[1] : ': ', eol, end: /\r?\n$/.test(text) ? eol : '', dot};
  }

  static write(v, fmt) {
    const {indent, colon, eol, end, dot} = {...JsonFormat.DEFAULT, ...fmt}, dots = new Set(dot);
    const out = (x, pad, key) => {
      if (Number.isInteger(x) && dots.has(key)) return x + '.0';
      if (x === null || typeof x !== 'object') return JSON.stringify(x);
      const arr = Array.isArray(x), p = pad + indent;
      const items = arr ? x.map(y => out(y, p)) : Object.entries(x).map(([k, y]) => JSON.stringify(k) + colon + out(y, p, k));
      if (!items.length) return arr ? '[]' : '{}';
      return indent ? `${arr ? '[' : '{'}${eol}${items.map(s => p + s).join(',' + eol)}${eol}${pad}${arr ? ']' : '}'}`
        : `${arr ? '[' : '{'}${items.join(',')}${arr ? ']' : '}'}`;
    };
    return out(v, '') + end;
  }
}

// 확인: node js/json/JsonFormat.js
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('JsonFormat.js')) {
  const same = (a, b) => { if (a !== b) throw new Error(`\n${JSON.stringify(a)}\n!=\n${JSON.stringify(b)}`); };
  const data = [{ID: 10, Name: 'a: b', List: [1, 2], Obj: {}, None: null}, {ID: 11, Name: '"q"', List: [], Obj: {x: true}, None: -0.5}];
  same(JsonFormat.write(data), JSON.stringify(data, null, 2)); // 기본은 예전과 같다
  for (const text of [
    '[\n    {\n        "ID":10,\n        "Name":"x"\n    }\n]',
    '[\r\n\t{\r\n\t\t"ID" : 10,\r\n\t\t"Name" : "x"\r\n\t}\r\n]\r\n',
    '[{"ID":10,"Name":"x"}]',
  ]) same(JsonFormat.write(JSON.parse(text), JsonFormat.detect(text)), text);
  console.log('ok');
}
