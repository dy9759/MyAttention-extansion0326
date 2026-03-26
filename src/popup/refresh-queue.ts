export type RefreshTaskType =
  | 'refreshConversations'
  | 'refreshSnippets'
  | 'refreshStorageStats'
  | 'refreshLocalStoreStatus'
  | 'refreshRuntimeDiagnostics';

export type RefreshTaskRunner = (taskType: RefreshTaskType) => Promise<void>;

interface PopupRefreshQueueOptions {
  coalesceWindowMs?: number;
  priorities?: Partial<Record<RefreshTaskType, number>>;
}

interface ScheduledTask {
  taskType: RefreshTaskType;
  dueAt: number;
  createdAt: number;
}

interface PendingEntry {
  taskType: RefreshTaskType;
  createdAt: number;
}

const DEFAULT_COALESCE_WINDOW_MS = 250;

const DEFAULT_PRIORITIES: Record<RefreshTaskType, number> = {
  refreshConversations: 100,
  refreshSnippets: 90,
  refreshStorageStats: 80,
  refreshLocalStoreStatus: 60,
  refreshRuntimeDiagnostics: 40,
};

function resolveNow(): number {
  return Date.now();
}

export class PopupRefreshQueue {
  private readonly runner: RefreshTaskRunner;

  private readonly priorities: Record<RefreshTaskType, number>;

  private readonly coalesceWindowMs: number;

  private readonly scheduled = new Map<RefreshTaskType, ScheduledTask>();

  private readonly pending = new Map<RefreshTaskType, PendingEntry>();

  private timer: number | null = null;

  private isRunning = false;

  constructor(runner: RefreshTaskRunner, options: PopupRefreshQueueOptions = {}) {
    this.runner = runner;
    this.coalesceWindowMs = options.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS;
    this.priorities = {
      ...DEFAULT_PRIORITIES,
      ...(options.priorities || {}),
    };
  }

  enqueue(taskType: RefreshTaskType): void {
    const now = resolveNow();
    const existing = this.scheduled.get(taskType);

    if (existing) {
      existing.dueAt = now + this.coalesceWindowMs;
      this.scheduled.set(taskType, existing);
    } else {
      this.scheduled.set(taskType, {
        taskType,
        dueAt: now + this.coalesceWindowMs,
        createdAt: now,
      });
    }

    this.armTimer();
  }

  async flush(): Promise<void> {
    this.promoteDueTasks(Number.POSITIVE_INFINITY);
    await this.runPendingTasks();
  }

  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduled.clear();
    this.pending.clear();
  }

  private armTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const nextDueAt = this.findNextDueAt();
    if (nextDueAt === null) {
      return;
    }

    const delay = Math.max(0, nextDueAt - resolveNow());
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.promoteDueTasks(resolveNow());
      void this.runPendingTasks();
      this.armTimer();
    }, delay);
  }

  private findNextDueAt(): number | null {
    let minDueAt: number | null = null;

    this.scheduled.forEach((task) => {
      if (minDueAt === null || task.dueAt < minDueAt) {
        minDueAt = task.dueAt;
      }
    });

    return minDueAt;
  }

  private promoteDueTasks(now: number): void {
    const promoted: Array<[RefreshTaskType, ScheduledTask]> = [];

    this.scheduled.forEach((task, taskType) => {
      if (task.dueAt <= now) {
        promoted.push([taskType, task]);
      }
    });

    promoted.forEach(([taskType, task]) => {
      this.scheduled.delete(taskType);
      const existing = this.pending.get(taskType);
      if (!existing || task.createdAt < existing.createdAt) {
        this.pending.set(taskType, {
          taskType,
          createdAt: task.createdAt,
        });
      }
    });
  }

  private async runPendingTasks(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      while (this.pending.size > 0) {
        const nextTask = this.pickNextTask();
        if (!nextTask) {
          break;
        }

        this.pending.delete(nextTask.taskType);
        try {
          await this.runner(nextTask.taskType);
        } catch (error) {
          // refresh 任务失败不应阻塞后续任务
          console.error('[PopupRefreshQueue] refresh task failed:', nextTask.taskType, error);
        }
      }
    } finally {
      this.isRunning = false;
      if (this.pending.size > 0) {
        void this.runPendingTasks();
      }
    }
  }

  private pickNextTask(): PendingEntry | null {
    const entries = Array.from(this.pending.values());
    if (!entries.length) {
      return null;
    }

    entries.sort((a, b) => {
      const priorityDiff = this.priorities[b.taskType] - this.priorities[a.taskType];
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.createdAt - b.createdAt;
    });

    return entries[0] || null;
  }
}

export function createPopupRefreshQueue(
  runner: RefreshTaskRunner,
  options: PopupRefreshQueueOptions = {}
): PopupRefreshQueue {
  return new PopupRefreshQueue(runner, options);
}
