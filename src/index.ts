// 必要なパッケージをインポートする
import 'dotenv/config';

import { client, commandHandler } from './utils/client.js';
import { fileURLToPath } from 'url';
import { prisma } from './utils/prisma.js';
import { startBot } from './bot.js';
import { startMCPServer } from './mcp/server.js';

export { prisma, client, commandHandler };

// index.tsから直接起動された場合、bot.tsとmcp/server.tsの両方を起動
const _filename = fileURLToPath(import.meta.url);
if (process.argv[1] === _filename) {
  // bot.tsとmcp/server.tsを同時に起動
  Promise.all([startBot(), startMCPServer()]).catch((err) => {
    console.error('起動時にエラーが発生しました:', err);
    process.exit(1);
  });
}
