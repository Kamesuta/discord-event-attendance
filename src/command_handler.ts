import { ApplicationCommandDataResolvable, Interaction } from 'discord.js';
import { client } from './index.js';
import { config } from './utils/config.js';
import { showGameResults } from './game_command_handler.js';
import { logger } from './utils/log.js';
import { getEventFromId } from './event/event.js';
import { InteractionBase } from './commands/base/interaction_base.js';
import eventCommand from './commands/event_command/EventCommand.js';
import eventReviewCommand from './commands/event_command/EventReviewCommand.js';
import eventShowCommand from './commands/event_command/EventShowCommand.js';
import eventGameCommand from './commands/event_command/EventGameCommand.js';
import eventStartCommand from './commands/event_command/EventStartCommand.js';
import eventUpdateCommand from './commands/event_command/EventUpdateCommand.js';
import eventStopCommand from './commands/event_command/EventStopCommand.js';
import statusCommand from './commands/status_command/StatusCommand.js';
import statusEventCommand from './commands/status_command/StatusEventCommand.js';
import statusUserCommand from './commands/status_command/StatusUserCommand.js';
import statusGameCommand from './commands/status_command/StatusGameCommand.js';
import markShowUserMenu from './commands/contextmenu/MarkShowUserMenu.js';
import statusUserMenu from './commands/contextmenu/StatusUserMenu.js';
import markHideUserMenu from './commands/contextmenu/MarkHideUserMenu.js';
import markClearUserMenu from './commands/contextmenu/MarkClearUserMenu.js';
import setMemoUserMenu from './commands/contextmenu/SetMemoUserMenu.js';
import updateEventMessageMenu from './commands/contextmenu/UpdateEventMessageMenu.js';
import setShowStats from './event/setShowStats.js';
import setMemoAction from './commands/action/SetMemoAction.js';

/**
 * 全コマンドリスト
 */
const commands: InteractionBase[] = [
  eventCommand,
  eventReviewCommand,
  eventShowCommand,
  eventGameCommand,
  eventUpdateCommand,
  eventStartCommand,
  eventStopCommand,
  statusCommand,
  statusUserCommand,
  statusEventCommand,
  statusGameCommand,
  statusUserMenu,
  markShowUserMenu,
  markHideUserMenu,
  markClearUserMenu,
  setMemoUserMenu,
  updateEventMessageMenu,
  setMemoAction,
];

/**
 * コマンドを登録します
 */
export async function registerCommands(): Promise<void> {
  // イベント管理者用のコマンドを登録
  const guild = await client.guilds.fetch(config.guild_id);

  // 登録するコマンドリスト
  const applicationCommands: ApplicationCommandDataResolvable[] = [];

  // サブコマンドを構築
  commands.forEach((command) => command.registerSubCommands());

  // コマンドを構築
  commands.forEach((command) => command.registerCommands(applicationCommands));

  // コマンドを登録
  await guild.commands.set(applicationCommands);
}

/**
 * イベントコマンドを処理します
 * @param interaction インタラクション
 */
export async function onInteractionCreate(
  interaction: Interaction,
): Promise<void> {
  try {
    // すべてのコマンドを処理
    await Promise.all(
      commands.map((command) => command.onInteractionCreate(interaction)),
    );

    if (interaction.isMessageComponent()) {
      // コンポーネントによって処理を分岐
      const match = interaction.customId.match(/event_component_(.+?)_(\d+)/);
      if (match) {
        const [_, type, eventId] = match;

        await interaction.deferReply({ ephemeral: true });
        const event = await getEventFromId(
          eventId ? parseInt(eventId) : undefined,
        );
        if (!event) {
          await interaction.editReply({
            content: 'イベントが見つかりませんでした',
          });
          return;
        }

        if (type === 'show' && interaction.isUserSelectMenu()) {
          // 出席としてマーク
          await setShowStats(event, interaction.values, true);
          await interaction.editReply({
            content: `${interaction.values
              .map((userId) => `<@${userId}>`)
              .join('')} を☑️出席としてマークしました`,
          });
        } else if (type === 'hide' && interaction.isUserSelectMenu()) {
          // 欠席としてマーク
          await setShowStats(event, interaction.values, false);
          await interaction.editReply({
            content: `${interaction.values
              .map((userId) => `<@${userId}>`)
              .join('')} を❌欠席としてマークしました`,
          });
        } else if (type === 'game' && interaction.isStringSelectMenu()) {
          // 試合結果を表示
          const gameId = parseInt(interaction.values[0]);
          await showGameResults(interaction, gameId);
        }
      }
    }
  } catch (error) {
    logger.error('onInteractionCreate中にエラーが発生しました。', error);
  }
}
