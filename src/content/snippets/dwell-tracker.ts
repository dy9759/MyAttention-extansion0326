export interface DwellRecord {
  element: Element;
  dwellMs: number;
}

interface ActiveRecord {
  startedAt: number;
  totalMs: number;
}

export class DwellTracker {
  private observer: IntersectionObserver | null = null;

  private readonly activeRecords = new Map<Element, ActiveRecord>();

  private readonly emitted = new Set<Element>();

  constructor(
    private readonly onDwell: (record: DwellRecord) => void,
    private readonly thresholdMs = 3000
  ) {}

  observe(elements: Element[]): void {
    this.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        const now = Date.now();

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const current = this.activeRecords.get(entry.target) || { startedAt: now, totalMs: 0 };
            current.startedAt = now;
            this.activeRecords.set(entry.target, current);
            return;
          }

          const active = this.activeRecords.get(entry.target);
          if (!active) {
            return;
          }

          active.totalMs += Math.max(0, now - active.startedAt);
          this.activeRecords.delete(entry.target);

          if (active.totalMs >= this.thresholdMs && !this.emitted.has(entry.target)) {
            this.emitted.add(entry.target);
            this.onDwell({
              element: entry.target,
              dwellMs: active.totalMs,
            });
          }
        });
      },
      { threshold: [0.5] }
    );

    elements.forEach((element) => this.observer?.observe(element));
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.activeRecords.clear();
  }
}
