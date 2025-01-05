/**
 * Creates a throttled version of a function that can only be called at most once 
 * in the specified time period. Different calls can be throttled separately using keys.
 * 
 * @param func The function to throttle
 * @param limit The minimum time (in milliseconds) that must pass between function calls
 * @param key Optional string key for separate throttling
 * @returns A throttled version of the input function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
  key: string = 'default'
): (...args: Parameters<T>) => void {
  const inThrottleMap = new Map<string, boolean>();
  const lastResultMap = new Map<string, ReturnType<T>>();

  return function throttled(this: any, ...args: Parameters<T>): void {
    if (!inThrottleMap.get(key)) {
      lastResultMap.set(key, func.apply(this, args));
      inThrottleMap.set(key, true);

      setTimeout(() => {
        inThrottleMap.set(key, false);
      }, limit);
    }
  };
}
