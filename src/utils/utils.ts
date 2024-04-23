/**
 * Sleep function
 * @param msec Waiting time (in milliseconds)
 * @returns Promise
 */
export const sleep = (msec: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, msec));
