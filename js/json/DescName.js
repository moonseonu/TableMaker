// 테이블 설명서(.md) 파일 이름: ItemDataTable.json 옆에 ItemDataTable_Desc.md.
// 이름이 JSON과 같으면(ItemDataTable.md) Unity Resources.Load("ItemDataTable")이 어느 파일인지 헷갈려서 꼬리를 붙인다.
// 'Meta'는 Unity의 .meta 파일과 헷갈려서, 형식(_md)보다 용도를 담는 관례대로 _Desc. 예전 이름(ItemDataTable.md)도 읽을 때는 알아본다
export const descName = base => base + '_Desc.md';

// 파일 이름 → 테이블 이름 (ItemDataTable.json · ItemDataTable_Desc.md · 예전 ItemDataTable.md 모두 ItemDataTable)
export const tableOf = fileName => fileName.replace(/\.[^.]+$/, '').replace(/_Desc$/i, '');

// 새 이름 설명서 → 예전 이름 (커밋할 때 GitHub에 남은 예전 이름 파일을 지우려고)
export const oldDescName = name => name.replace(/_Desc\.md$/i, '.md');
