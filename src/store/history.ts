import type { Document } from '@/types/document';

export interface HistoryCommand {
  label: string;
  before: Document;
  after: Document;
  time: number;
}

export class History {
  stack: HistoryCommand[] = [];
  index = -1; // points to the last applied command
  capacity = 100;
  mergeWindow = 300; // ms

  /** Push a new command. If the top command shares the same label and is within the merge window, merge. */
  push(cmd: HistoryCommand) {
    // Drop redo tail
    if (this.index < this.stack.length - 1) {
      this.stack.splice(this.index + 1);
    }
    const top = this.stack[this.index];
    if (top && top.label === cmd.label && cmd.time - top.time < this.mergeWindow) {
      top.after = cmd.after;
      top.time = cmd.time;
      return;
    }
    this.stack.push(cmd);
    if (this.stack.length > this.capacity) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  canUndo() {
    return this.index >= 0;
  }
  canRedo() {
    return this.index < this.stack.length - 1;
  }

  undo(): Document | null {
    if (!this.canUndo()) return null;
    const cmd = this.stack[this.index--];
    return cmd.before;
  }

  redo(): Document | null {
    if (!this.canRedo()) return null;
    const cmd = this.stack[++this.index];
    return cmd.after;
  }

  clear() {
    this.stack = [];
    this.index = -1;
  }
}
