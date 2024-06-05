import {
  ActionRowBuilder,
  ApplicationCommandDataResolvable,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  Interaction,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { client, prisma } from './index.js';
import { config } from './utils/config.js';
import { Event } from '@prisma/client';
import { showGameResults } from './game_command_handler.js';
import { updateEvent } from './event_handler.js';
import { logger } from './utils/log.js';
import showEvent from './event/showEvent.js';
import { getEventFromDiscordId, getEventFromId } from './event/event.js';
import { InteractionBase } from './commands/base/interaction_base.js';
import eventCommand from './commands/event_command/EventCommand.js';
import eventReviewCommand from './commands/event_command/EventReviewCommand.js';
import eventShowCommand from './commands/event_command/EventShowCommand.js';
import eventGameCommand from './commands/event_command/EventGameCommand.js';
import eventStartCommand from './commands/event_command/EventStartCommand.js';
import eventUpdateCommand from './commands/event_command/EventUpdateCommand.js';
import eventStopCommand from './commands/event_command/EventStopCommand.js';
import showUserStatus from './event/showUserStatus.js';
import statusCommand from './commands/status_command/StatusCommand.js';
import statusEventCommand from './commands/status_command/StatusEventCommand.js';
import statusUserCommand from './commands/status_command/StatusUserCommand.js';
import statusGameCommand from './commands/status_command/StatusGameCommand.js';

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
];

const contextStatusCommand = new ContextMenuCommandBuilder()
  .setType(ApplicationCommandType.User)
  .setName('イベントの参加状況を確認');

const contextMarkShowCommand = new ContextMenuCommandBuilder()
  .setType(ApplicationCommandType.User)
  .setName('[O]出席としてマーク')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

const contextMarkHideCommand = new ContextMenuCommandBuilder()
  .setType(ApplicationCommandType.User)
  .setName('[X]欠席としてマーク')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

const contextMarkClearCommand = new ContextMenuCommandBuilder()
  .setType(ApplicationCommandType.User)
  .setName('[_]出欠をクリア')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

const contextSetMemoCommand = new ContextMenuCommandBuilder()
  .setType(ApplicationCommandType.User)
  .setName('メモを設定')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

const contextUpdateEventCommand = new ContextMenuCommandBuilder()
  .setType(ApplicationCommandType.Message)
  .setName('イベント情報を更新')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents);

/**
 * コマンドを登録します
 */
export async function registerCommands(): Promise<void> {
  // イベント管理者用のコマンドを登録
  const guild = await client.guilds.fetch(config.guild_id);

  // 登録するコマンドリスト
  const applicationCommands: ApplicationCommandDataResolvable[] = [
    contextStatusCommand,
    contextMarkShowCommand,
    contextMarkHideCommand,
    contextMarkClearCommand,
    contextSetMemoCommand,
    contextUpdateEventCommand,
  ];

  // サブコマンドを構築
  commands.forEach((command) => command.registerSubCommands());

  // コマンドを構築
  commands.forEach((command) => command.registerCommands(applicationCommands));

  // コマンドを登録
  await guild.commands.set(applicationCommands);
}

async function setShowStats(
  event: Event,
  userIds: string[],
  isShow: boolean | null,
): Promise<void> {
  // ユーザーの出欠状況を更新
  const query = userIds.map((userId) =>
    prisma.userStat.upsert({
      where: {
        id: {
          eventId: event.id,
          userId,
        },
      },
      update: {
        show: isShow,
      },
      create: {
        eventId: event.id,
        userId,
        show: isShow,
        duration: 0,
      },
    }),
  );
  await prisma.$transaction(query);
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

    if (interaction.isUserContextMenuCommand()) {
      // コマンドによって処理を分岐
      switch (interaction.commandName) {
        // 確認用コマンド
        case contextStatusCommand.name: {
          await interaction.deferReply({ ephemeral: true });
          await showUserStatus(interaction, interaction.targetUser.id);
          break;
        }
        // 出席としてマーク
        case contextMarkShowCommand.name: {
          await interaction.deferReply({ ephemeral: true });
          const event = await getEventFromId(undefined);
          if (!event) {
            await interaction.editReply({
              content: 'イベントが見つかりませんでした',
            });
            return;
          }
          await setShowStats(event, [interaction.targetUser.id], true);
          await interaction.editReply({
            content: `<@${interaction.targetUser.id}> を☑️出席としてマークしました`,
          });
          break;
        }
        // 欠席としてマーク
        case contextMarkHideCommand.name: {
          await interaction.deferReply({ ephemeral: true });
          const event = await getEventFromId(undefined);
          if (!event) {
            await interaction.editReply({
              content: 'イベントが見つかりませんでした',
            });
            return;
          }
          await setShowStats(event, [interaction.targetUser.id], false);
          await interaction.editReply({
            content: `<@${interaction.targetUser.id}> を❌欠席としてマークしました`,
          });
          break;
        }
        // 出欠をクリア
        case contextMarkClearCommand.name: {
          await interaction.deferReply({ ephemeral: true });
          const event = await getEventFromId(undefined);
          if (!event) {
            await interaction.editReply({
              content: 'イベントが見つかりませんでした',
            });
            return;
          }
          await setShowStats(event, [interaction.targetUser.id], null);
          await interaction.editReply({
            content: `<@${interaction.targetUser.id}> の⬛出欠をクリアしました`,
          });
          break;
        }
        // メモを設定
        case contextSetMemoCommand.name: {
          const event = await getEventFromId(undefined);
          if (!event) {
            await interaction.reply({
              ephemeral: true,
              content: 'イベントが見つかりませんでした',
            });
            return;
          }

          // 現在のメモを取得
          const userStat = await prisma.userStat.findFirst({
            where: {
              eventId: event.id,
              userId: interaction.targetUser.id,
            },
          });

          // メモ入力欄を作成
          const textInput = new TextInputBuilder()
            .setCustomId('memo')
            .setLabel('メモを入力してください (「!」を入力で削除)')
            .setMinLength(0)
            .setMaxLength(512)
            .setStyle(TextInputStyle.Short)
            .setValue(userStat?.memo ?? '');

          // メモ入力モーダルを表示
          await interaction.showModal(
            new ModalBuilder()
              .setTitle('メモ入力')
              .setCustomId(
                `event_modal_memo_${interaction.targetUser.id}_${event.id}`,
              )
              .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                  textInput,
                ),
              ),
          );
          break;
        }
      }
    } else if (interaction.isMessageContextMenuCommand()) {
      // コマンドによって処理を分岐
      switch (interaction.commandName) {
        // イベント情報を更新
        case contextUpdateEventCommand.name: {
          await interaction.deferReply({ ephemeral: true });
          // EmbedのURLを解析
          const url = interaction.targetMessage.embeds[0]?.url;
          if (!url) {
            await interaction.editReply({
              content: 'イベントお知らせメッセージに対してのみ使用できます',
            });
            return;
          }
          const match = url.match(/\/(\d+)$/);
          if (!match) {
            await interaction.editReply({
              content: 'イベントお知らせメッセージのURLが不正です',
            });
            return;
          }
          const scheduledEventId = match[1];
          // ScheduledEventが取得できれば更新
          const scheduledEvent =
            await interaction.guild?.scheduledEvents.fetch(scheduledEventId);
          if (scheduledEvent) {
            await updateEvent(scheduledEvent);
          }
          // イベント情報を取得
          const event = await getEventFromDiscordId(scheduledEventId);
          if (!event) {
            await interaction.editReply({
              content: 'イベントが見つかりませんでした',
            });
            return;
          }
          // イベント情報を編集
          await showEvent(
            interaction,
            event,
            true,
            interaction.targetMessage.content,
            undefined,
            interaction.targetMessage,
          );
          break;
        }
      }
    } else if (interaction.isMessageComponent()) {
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
    } else if (interaction.isModalSubmit()) {
      // コンポーネントによって処理を分岐
      const match = interaction.customId.match(/event_modal_(.+?)_(\d+)_(\d+)/);
      if (match) {
        const [_, type, userId, eventId] = match;

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

        if (type === 'memo') {
          const memo = interaction.components[0]?.components[0]?.value;
          if (memo === undefined || memo === '' || memo === '!') {
            await prisma.userStat.update({
              where: {
                id: {
                  eventId: event.id,
                  userId,
                },
              },
              data: {
                memo: null,
              },
            });
            await interaction.editReply({
              content: 'メモを削除しました',
            });
          } else {
            await prisma.userStat.update({
              where: {
                id: {
                  eventId: event.id,
                  userId,
                },
              },
              data: {
                memo,
              },
            });
            await interaction.editReply({
              content: 'メモを更新しました',
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error('onInteractionCreate中にエラーが発生しました。', error);
  }
}
