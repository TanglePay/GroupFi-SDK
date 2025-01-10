/**
 * Creates a throttled version of a function that can only be called at most once 
 * in the specified time period. Different calls can be throttled separately using keys.
 * 
 * @param func The function to throttle
 * @param limit The minimum time (in milliseconds) that must pass between function calls
 * @param key Optional string key for separate throttling
 * @returns A throttled version of the input function
 */
// Static Maps to maintain throttling state across all instances
const inThrottleMap = new Map<string, boolean>();
const lastResultMap = new Map<string, ReturnType<any>>();

/**
 * Clears all throttle states and results
 */
export function clearAllThrottles(): void {
  inThrottleMap.clear();
  lastResultMap.clear();
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
  key: string = 'default'
): (...args: Parameters<T>) => void {
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

/**
 * Creates a debounced version of a function that delays its execution until after
 * a specified time period has elapsed since the last call. Different calls can be
 * debounced separately using keys.
 * 
 * @param func The function to debounce
 * @param wait The time to wait (in seconds) after the last call before executing
 * @param key Optional string key for separate debouncing
 * @returns A debounced version of the input function
 */
// Similarly, timeoutMap should be static for debounce
const timeoutMap = new Map<string, NodeJS.Timeout>();

/**
 * Clears all debounce timeouts and states
 */
export function clearAllDebounces(): void {
  // Clear all pending timeouts
  timeoutMap.forEach(timeout => clearTimeout(timeout));
  timeoutMap.clear();
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  key: string = 'default'
): (...args: Parameters<T>) => void {
  return function debounced(this: any, ...args: Parameters<T>): void {
    const existingTimeout = timeoutMap.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      func.apply(this, args);
      timeoutMap.delete(key);
    }, wait * 1000);

    timeoutMap.set(key, timeout);
  };
}

/**
 * Clears all throttle and debounce states
 */
export function clearAll(): void {
  clearAllThrottles();
  clearAllDebounces();
}

/**
 * Clears throttle state and result for a specific key
 * @param key The key to clear throttle for
 */
export function clearThrottleByKey(key: string): void {
  inThrottleMap.delete(key);
  lastResultMap.delete(key);
}

/**
 * Clears debounce timeout and state for a specific key
 * @param key The key to clear debounce for
 */
export function clearDebounceByKey(key: string): void {
  const timeout = timeoutMap.get(key);
  if (timeout) {
    clearTimeout(timeout);
    timeoutMap.delete(key);
  }
}

/**
 * Clears both throttle and debounce states for a specific key
 * @param key The key to clear states for
 */
export function clearByKey(key: string): void {
  clearThrottleByKey(key);
  clearDebounceByKey(key);
}
