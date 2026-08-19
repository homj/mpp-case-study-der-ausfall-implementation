/**
 * The one place that decides what the front desk sees first (ADR-0004).
 * Time pressure first, then prescription risk, then whether a phone call can work.
 */

export interface RankableTask {
  earliestStartsAt: Date;
  warningCount: number;
  phoneContactable: boolean;
  pinned?: boolean;
}

/** Sorts front-desk work: pinned, then earliest start, then most warnings, then reachable by phone. */
export function rankTasks<T extends RankableTask>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pinnedA = a.pinned ? 0 : 1;
    const pinnedB = b.pinned ? 0 : 1;
    if (pinnedA !== pinnedB) return pinnedA - pinnedB;

    const startDiff = a.earliestStartsAt.getTime() - b.earliestStartsAt.getTime();
    if (startDiff !== 0) return startDiff;

    if (a.warningCount !== b.warningCount) return b.warningCount - a.warningCount;

    const phoneA = a.phoneContactable ? 0 : 1;
    const phoneB = b.phoneContactable ? 0 : 1;
    return phoneA - phoneB;
  });
}
