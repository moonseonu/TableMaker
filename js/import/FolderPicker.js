import {esc} from '../common/util.js';
import {CheckPicker} from '../common/CheckPicker.js';

// 폴더를 고르면 윈도우 창엔 폴더만 보여서, 안의 파일을 표로 보여 주고 체크한 것만 불러온다 (불러오기 ▾ → 폴더, 설명 → 폴더).
// entries: [{file, kind, dest(HTML), on}] — 들어갈 곳과 처음 체크 여부는 부르는 쪽이 정한다 → 고른 entries, 취소하면 null
export class FolderPicker {
  static async pick(entries) {
    if (!entries.length) return [];
    // 경로는 '고른폴더/하위/파일'. 표에는 고른 폴더 이름을 뺀 나머지만
    const path = f => f.webkitRelativePath || f.name, root = path(entries[0].file).split('/')[0];
    const rel = f => path(f).replace(/^[^/]*\//, '');
    entries = [...entries].sort((a, b) => path(a.file).localeCompare(path(b.file)));
    const size = n => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    const picked = await CheckPicker.pick({
      title: `폴더 '${esc(root)}'`, ok: '불러오기',
      text: '불러올 파일을 고르세요. 이 툴이 열 수 있는 파일만 보입니다.',
      heads: ['파일', '종류', '크기', '들어갈 곳'],
      rows: entries.map(e => [`<b>${esc(rel(e.file))}</b>`, e.kind, size(e.file.size), e.dest]),
      checked: entries.map(e => e.on),
    });
    return picked && picked.map(i => entries[i]);
  }
}
