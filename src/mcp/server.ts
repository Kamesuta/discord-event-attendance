import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { Request, Response } from 'express';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
// ハンドラーとツール定義のインポート
import { getEventStatus, getEventStatusTool } from './handlers/event-status.js';
import { getEventList, getEventListTool } from './handlers/event-list.js';
import { getUserStatus, getUserStatusTool } from './handlers/user-status.js';
import { getGameStatus, getGameStatusTool } from './handlers/game-status.js';
import {
  getParticipationRanking,
  getParticipationRankingTool,
} from './handlers/participation-ranking.js';
import { getHostRanking, getHostRankingTool } from './handlers/host-ranking.js';
import { getXpRanking, getXpRankingTool } from './handlers/xp-ranking.js';
import {
  getHostPerformanceRanking,
  getHostPerformanceRankingTool,
} from './handlers/host-performance-ranking.js';
import { logger } from '../utils/log.js';
import { fileURLToPath } from 'url';

/**
 * MCPサーバーインスタンスを作成する関数
 * @returns 設定済みのMCPサーバーインスタンス
 */
function createServer(): Server {
  const server = new Server(
    {
      name: 'discord-event-attendance-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // ツール一覧を返すハンドラー
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [
        getEventStatusTool,
        getEventListTool,
        getUserStatusTool,
        getGameStatusTool,
        getParticipationRankingTool,
        getHostRankingTool,
        getXpRankingTool,
        getHostPerformanceRankingTool,
      ],
    };
  });

  // ツール実行ハンドラー
  server.setRequestHandler(
    CallToolRequestSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (request): Promise<any> => {
      try {
        const { name, arguments: args } = request.params;

        switch (name) {
          case 'get-event-status':
            return await getEventStatus(args);
          case 'get-event-list':
            return await getEventList(args);
          case 'get-user-status':
            return await getUserStatus(args);
          case 'get-game-status':
            return await getGameStatus(args);
          case 'get-participation-ranking':
            return await getParticipationRanking(args);
          case 'get-host-ranking':
            return await getHostRanking(args);
          case 'get-xp-ranking':
            return await getXpRanking(args);
          case 'get-host-performance-ranking':
            return await getHostPerformanceRanking(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error('MCP tool execution failed:', error);
        throw error;
      }
    },
  );

  return server;
}

/**
 * MCPサーバーの初期化と起動
 */
async function main(): Promise<void> {
  // サーバー起動
  const port = process.env.PORT;

  if (port) {
    // PORT環境変数が設定されている場合はHTTPでホスト
    const app = express();
    app.use(express.json());

    // MCPエンドポイント
    app.post('/mcp', async (req: Request, res: Response): Promise<void> => {
      // ステートレスモードでは、各リクエストで新しいトランスポートとサーバーのインスタンスを作成
      // 複数のクライアントが同時に接続した場合のリクエストID衝突を防ぐため
      try {
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });

        res.on('close', () => {
          logger.info('Request closed');
          void transport.close();
          void server.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    app.listen(parseInt(port, 10), () => {
      logger.info(
        `Discord Event Attendance MCP Server started on HTTP port ${port}`,
      );
    });
  } else {
    // 従来のstdioトランスポート
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // stdioトランスポートの通信を妨げるため、標準出力に出力してはいけない
    logger.debug('Discord Event Attendance MCP Server started on stdio');
  }
}

// エラーハンドリング
process.on('SIGINT', (): void => {
  logger.error('MCP Server shutting down...');
  process.exit(0);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection in MCP server:', error);
  process.exit(1);
});

// サーバー起動
const _filename = fileURLToPath(import.meta.url);
if (process.argv[1] === _filename) {
  main().catch((error) => {
    logger.error('Failed to start MCP server:', error);
    process.exit(1);
  });
}

export { main as startMCPServer };
