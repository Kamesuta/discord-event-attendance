import { join } from 'path';

/** Path to the working directory */
export const workdir = process.env.APP_BASEDIR ?? 'run';

/**
 * Get a path relative to the working directory
 * @param path Relative path from the working directory
 * @returns The path
 */
export function getWorkdirPath(path: string): string {
  return join(workdir, path);
}
