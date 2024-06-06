import { ApplicationCommandDataResolvable, Interaction } from 'discord.js';
import { client } from '../index.js';
import { config } from '../utils/config.js';
import { logger } from '../utils/log.js';
import { InteractionBase } from './base/interaction_base.js';

/**
 * コマンドハンドラー
 */
export default class CommandHandler {
  /**
   * コマンドハンドラーを初期化します
   * @param _commands コマンドリスト
   */
  constructor(private _commands: InteractionBase[]) {}

  /**
   * コマンドを登録します
   */
  async registerCommands(): Promise<void> {
    // イベント管理者用のコマンドを登録
    const guild = await client.guilds.fetch(config.guild_id);

    // 登録するコマンドリスト
    const applicationCommands: ApplicationCommandDataResolvable[] = [];

    // サブコマンドを構築
    this._commands.forEach((command) => command.registerSubCommands());

    // コマンドを構築
    this._commands.forEach((command) =>
      command.registerCommands(applicationCommands),
    );

    // コマンドを登録
    await guild.commands.set(applicationCommands);
  }

  /**
   * イベントコマンドを処理します
   * @param interaction インタラクション
   */
  async onInteractionCreate(interaction: Interaction): Promise<void> {
    try {
      // すべてのコマンドを処理
      await Promise.all(
        this._commands.map((command) =>
          command.onInteractionCreate(interaction),
        ),
      );
    } catch (error) {
      logger.error('onInteractionCreate中にエラーが発生しました。', error);
    }
  }
}
