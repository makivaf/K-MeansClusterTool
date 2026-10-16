/** One heavy research process per API instance, including legacy endpoints. */
let occupied = false;
const waiting: Array<() => void> = [];

export async function withResearchCapacity<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      const index = waiting.indexOf(enter);
      if (index >= 0) waiting.splice(index, 1);
      reject(new Error("Execution cancelled while waiting for capacity."));
    };
    const enter = () => {
      signal?.removeEventListener("abort", cancel);
      occupied = true;
      resolve();
    };
    if (signal?.aborted) { cancel(); return; }
    if (!occupied) enter();
    else { waiting.push(enter); signal?.addEventListener("abort", cancel, { once: true }); }
  });
  try {
    if (signal?.aborted) throw new Error("Execution cancelled.");
    return await work();
  } finally {
    occupied = false;
    waiting.shift()?.();
  }
}
