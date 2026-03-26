import { selectedRange } from './range-utils';

export class SelectionObserver {
  private pendingCallback: number | null = null;

  private cleanupFns: Array<() => void> = [];

  constructor(
    private readonly callback: (range: Range | null) => void,
    private readonly documentRef: Document = document
  ) {
    let isMouseDown = false;

    const scheduleCallback = (delay = 10) => {
      this.pendingCallback = window.setTimeout(() => {
        this.callback(selectedRange(this.documentRef.getSelection()));
      }, delay);
    };

    const handler = (event: Event) => {
      if (event.type === 'mousedown') {
        isMouseDown = true;
      }
      if (event.type === 'mouseup') {
        isMouseDown = false;
      }
      if (isMouseDown) {
        return;
      }

      this.cancelPendingCallback();
      scheduleCallback(event.type === 'mouseup' ? 10 : 100);
    };

    this.addListener(this.documentRef, 'selectionchange', handler);
    if (this.documentRef.body) {
      this.addListener(this.documentRef.body, 'mousedown', handler);
      this.addListener(this.documentRef.body, 'mouseup', handler);
    }

    scheduleCallback(1);
  }

  disconnect(): void {
    this.cleanupFns.forEach((cleanup) => cleanup());
    this.cleanupFns = [];
    this.cancelPendingCallback();
  }

  private addListener(target: EventTarget, event: string, handler: EventListener): void {
    target.addEventListener(event, handler);
    this.cleanupFns.push(() => target.removeEventListener(event, handler));
  }

  private cancelPendingCallback(): void {
    if (this.pendingCallback !== null) {
      clearTimeout(this.pendingCallback);
      this.pendingCallback = null;
    }
  }
}
