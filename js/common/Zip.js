// zip 만들기·읽기 (외부 라이브러리 없이).
// 만들 때는 압축 없이 묶기만 한다(store): 텍스트 파일 몇 개라 압축할 이유가 없다.
// 읽을 때는 윈도우 탐색기·다른 프로그램이 만든 압축(deflate)도 브라우저 기본 기능으로 푼다

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// zip 안의 파일 날짜 (MS-DOS 형식)
function dosTime(d) {
  return {time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()};
}

export class Zip {
  // files: [{name, text}] → zip Blob
  static create(files) {
    const enc = new TextEncoder(), {time, date} = dosTime(new Date());
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const head = (sig, size) => {
        const v = new DataView(new ArrayBuffer(size));
        v.setUint32(0, sig, true);
        return v;
      };
      const local = head(0x04034b50, 30);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // 파일 이름이 UTF-8 (한글 테이블 이름)
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      parts.push(local, name, data);
      const cen = head(0x02014b50, 46);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(12, time, true);
      cen.setUint16(14, date, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, data.length, true);
      cen.setUint32(24, data.length, true);
      cen.setUint16(28, name.length, true);
      cen.setUint32(42, offset, true);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, size, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], {type: 'application/zip'});
  }

  // zip Blob → [{name, bytes}] (폴더 항목은 뺀다)
  static async read(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer()), v = new DataView(buf.buffer);
    let e = buf.length - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('zip 파일이 아닙니다');
    const count = v.getUint16(e + 10, true), out = [];
    let p = v.getUint32(e + 16, true);
    for (let i = 0; i < count; i++) {
      const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
      const nlen = v.getUint16(p + 28, true), skip = nlen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
      const off = v.getUint32(p + 42, true), rawName = buf.subarray(p + 46, p + 46 + nlen);
      p += 46 + skip;
      // 윈도우 탐색기로 만든 zip은 한글 이름이 UTF-8 표시 없이 EUC-KR로 들어 있다
      const name = flags & 0x0800 ? new TextDecoder().decode(rawName) : Zip.decodeName(rawName);
      if (name.endsWith('/')) continue;
      const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      let bytes = buf.subarray(start, start + size);
      if (method === 8) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else if (method !== 0) throw new Error(`${name}: 지원하지 않는 압축 방식입니다`);
      out.push({name, bytes});
    }
    return out;
  }

  static decodeName(raw) {
    try { return new TextDecoder('utf-8', {fatal: true}).decode(raw); }
    catch { return new TextDecoder('euc-kr').decode(raw); }
  }
}
