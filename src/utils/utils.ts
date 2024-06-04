import { logger } from './log.js';

/**
 * Sleep function
 * @param msec Waiting time (in milliseconds)
 * @returns Promise
 */
export const sleep = (msec: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, msec));

/**
 * Converts an asynchronous function functor to a functor that returns void.
 * Useful when there is no need to wait for the asynchronous function.
 * The return value is discarded, and any errors are logged.
 * @param func The asynchronous function functor
 * @returns A void-returning asynchronous function functor
 */
export function nowait<T extends (...args: never[]) => Promise<unknown>>(
  func: T,
): (...args: Parameters<T>) => void {
  return (...args) => {
    func(...args).catch((error) => {
      logger.error(error);
    });
  };
}
