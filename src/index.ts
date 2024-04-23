import { logger } from './log.js';
import { config } from './config.js';
import { sleep } from './utils.js';

/**
 * Main process
 * @returns Promise
 */
async function main(): Promise<void> {
  // Output a log message on startup
  logger.info('Hello, world! こんにちは、世界！ 你好，世界！ नमस्ते, दुनिया!');

  // Wait for 1 second
  await sleep(1000);

  // Log an output
  logger.info('Hello, world after 1 second!');

  // Output the configuration
  logger.info(`config.some_text_setting: ${config.some_text_setting}`);
}

void main();
