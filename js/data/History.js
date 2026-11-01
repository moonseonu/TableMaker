// 되돌리기(Ctrl+Z)·다시 하기(Ctrl+Y). 바뀔 때마다 탭 전체를 글자(JSON)로 찍어 둔다 (최대 100번).
// 한 칸에 이어서 타이핑한 것은 한 번으로 묶는다(group이 같으면 새로 찍지 않음): 엑셀처럼 칸 단위로 되돌린다
const LIMIT = 100;

export class History {
  constructor(json) {
    this.undoStack = [];
    this.redoStack = [];
    this.last = json;
    this.group = null;
  }

  record(json, group = null) {
    if (json === this.last) return;
    if (!group || group !== this.group) {
      this.undoStack.push(this.last);
      if (this.undoStack.length > LIMIT) this.undoStack.shift();
    }
    this.redoStack = [];
    this.last = json;
    this.group = group;
  }

  // 되돌릴(다시 할) 상태의 JSON, 없으면 null
  undo() { return this.move(this.undoStack, this.redoStack); }
  redo() { return this.move(this.redoStack, this.undoStack); }

  move(from, to) {
    if (!from.length) return null;
    to.push(this.last);
    this.last = from.pop();
    this.group = null;
    return this.last;
  }
}
