import {
  ActionRowBuilder,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  Interaction,
  ModalBuilder,
  PermissionFlagsBits,
  RepliableInteraction,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { client, prisma } from './index.js';
import { config } from './utils/config.js';
import { Event } from '@prisma/client';
import { updateAttendanceTimeIfEventActive } from './attendance_time.js';
import {
  addGameResult,
  createGameCommand,
  getUserGameResults,
  showGameResults,
} from './game_command_handler.js';
import { endEvent, startEvent, updateEvent } from './event_handler.js';

/**
 * 出欠確認コマンド (イベント管理者用)
 */
const eventCommand = new SlashCommandBuilder()
  .setDescription('出欠確認コマンド (イベント管理者用)')
  .setName('event')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('review')
      .setDescription('イベントの出欠状況を表示します (自分のみに表示)')
      .addIntegerOption((option) =>
        option
          .setName('event_id')
          .setDescription('イベントID (省略時は最新のイベントを表示)')
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('show')
      .setDescription('イベントの出欠状況を表示します')
      .addIntegerOption((option) =>
        option
          .setName('event_id')
          .setDescription('イベントID (省略時は最新のイベントを表示)')
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('start')
      .setDescription('手動でイベントを開始します')
      .addIntegerOption((option) =>
        option
          .setName('event_id')
          .setDescription('DiscordのイベントID')
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('update')
      .setDescription('手動でイベント情報を更新します')
      .addIntegerOption((option) =>
        option
          .setName('event_id')
          .setDescription('イベントID (省略時は最新のイベントを表示)')
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('stop')
      .setDescription('手動でイベントを終了します')
      .addIntegerOption((option) =>
        option
          .setName('event_id')
          .setDescription('イベントID (省略時は最新のイベントを表示)')
          .setRequired(false),
      ),
  )
  .addSubcommand(createGameCommand);

/**
 * イベント参加状況を確認するコマンド
 */
const statusCommand = new SlashCommandBuilder()
  .setName('status')
  .setDescription('イベント参加状況を確認')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('user')
      .setDescription('ユーザーの過去のイベント参加状況を確認')
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('イベント参加状況を確認するユーザー')
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName('show')
          .setDescription(
            'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)',
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('event')
      .setDescription('イベントの出欠状況を確認')
      .addIntegerOption((option) =>
        option
          .setName('event_id')
          .setDescription('イベントID (省略時は最新のイベントを表示)')
          .setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName('show')
          .setDescription(
            'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)',
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('game')
      .setDescription('ゲームの勝敗を表示')
      .addIntegerOption((option) =>
        option.setName('game_id').setDescription('試合ID').setRequired(false),
      )
      .addBooleanOption((option) =>
        option
          .setName('show')
          .setDescription(
            'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)',
          )
          .setRequired(false),
      ),
  );

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

/**
 * コマンドを登録します
 */
export async function registerCommands(): Promise<void> {
  // イベント管理者用のコマンドを登録
  const guild = await client.guilds.fetch(config.guild_id);
  await guild.commands.set([
    eventCommand,
    statusCommand,
    contextStatusCommand,
    contextMarkShowCommand,
    contextMarkHideCommand,
    contextMarkClearCommand,
    contextSetMemoCommand,
  ]);
}

async function showEvent(
  interaction: RepliableInteraction,
  event: Event,
): Promise<void> {
  // 集計
  await updateAttendanceTimeIfEventActive(event);

  // イベントの出欠状況を表示
  const stats = await prisma.userStat.findMany({
    where: {
      eventId: event.id,
      duration: {
        // 必要接続分数を満たしているユーザーのみを抽出する (config.required_time分以上参加している)
        gt: config.required_time * 60 * 1000,
      },
    },
  });

  // ユーザーごとに参加回数をカウント
  const userCount = Object.fromEntries(
    await Promise.all(
      stats.map(async (stat) => {
        const count = await prisma.userStat.count({
          where: {
            userId: stat.userId,
            show: true,
          },
        });
        return [stat.userId, count] as const;
      }),
    ),
  );

  // イベントの時間を計算
  const duration =
    event.startTime && event.endTime
      ? ` (${Math.floor(
          (event.endTime.getTime() - event.startTime.getTime()) / 1000 / 60,
        )}分)`
      : '';

  // ユーザーごとのXP合計を取得
  const userXp = (
    await Promise.all(
      stats.map(async (stat) => {
        const xp = await prisma.userGameResult.aggregate({
          where: {
            eventId: event.id,
            userId: stat.userId,
          },
          // eslint-disable-next-line @typescript-eslint/naming-convention
          _sum: {
            xp: true,
          },
        });
        return [stat.userId, xp._sum.xp ?? 0] as const;
      }),
    )
  )
    .filter(([, xp]) => xp > 0)
    .sort(([, a], [, b]) => b - a);

  // 試合結果
  const gameResults = await prisma.gameResult.findMany({
    where: {
      eventId: event.id,
    },
    include: {
      users: true,
    },
  });

  const embeds = new EmbedBuilder()
    .setTitle(`🏁「${event.name}」イベントに参加してくれた人！`)
    .setURL(`https://discord.com/events/${config.guild_id}/${event.eventId}`)
    .setDescription(event.description ?? '説明なし')
    .setImage(event.coverImage)
    .setColor('#ff8c00')
    .setFooter({
      text: `「/status user <名前>」でユーザーの過去イベントの参加状況を確認できます${
        gameResults.length === 0
          ? ''
          : '\n下記プルダウンから各試合結果を確認できます'
      }\nイベントID: ${event.id}`,
    })
    .addFields({
      name: '開催日時',
      value: `${event.startTime?.toLocaleString() ?? '未定'} 〜 ${
        event.endTime?.toLocaleString() ?? '未定'
      } ${duration}`,
    })
    .addFields({
      name: '参加者 (観戦していただけの人は欠席扱いです)',
      value:
        // 公開モードの場合は参加者のみ表示
        stats
          .filter((stat) => stat.show)
          .map((stat) => {
            const count = userCount[stat.userId];
            const memo = stat.memo ? ` ${stat.memo}` : '';
            const countText =
              count === 1 ? '(🆕 初参加！)' : ` (${count}回目)${memo}`;
            return `<@${stat.userId}> ${countText}`;
          })
          .join('\n') || 'なし',
    })
    .addFields({
      name: `戦績 (計${gameResults.length}試合)`,
      value:
        userXp
          .map(([userId, xp], i) => `${i + 1}位: <@${userId}> (${xp}XP)`)
          .join('\n') || 'なし',
    });

  // 試合結果のプルダウンを追加
  const components =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`event_component_game_${event.id}`)
        .setPlaceholder('確認したい試合結果を選択')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          gameResults.map((game) => ({
            label: `${game.name} (試合ID: ${game.id})`,
            value: game.id.toString(),
          })),
        ),
    );

  // イベントの出欠状況を表示
  await interaction.editReply({
    embeds: [embeds],
    components: gameResults.length === 0 ? [] : [components],
  });
}

async function reviewEvent(
  interaction: RepliableInteraction,
  event: Event,
): Promise<void> {
  // 集計
  await updateAttendanceTimeIfEventActive(event);

  // イベントの出欠状況を表示
  const stats = await prisma.userStat.findMany({
    where: {
      eventId: event.id,
      duration: {
        // 必要接続分数を満たしているユーザーのみを抽出する (config.required_time分以上参加している)
        gt: config.required_time * 60 * 1000,
      },
    },
  });

  const embeds = new EmbedBuilder()
    .setTitle(`🏁「${event.name}」イベントに参加してくれた人を選択してください`)
    .setURL(`https://discord.com/events/${config.guild_id}/${event.eventId}`)
    .setDescription(
      '出席、欠席のステータスです。\n下のプルダウンからステータスを変更できます。',
    )
    .setColor('#ff8c00')
    .addFields({
      name: '参加者',
      value:
        // 非公開モードの場合は全員表示 (現在のステータスも表示)
        stats
          .map((stat) => {
            const memo = stat.memo ? ` (**メモ**: ${stat.memo})` : '';
            const mark = stat.show === null ? '⬛' : stat.show ? '☑️' : '❌';
            const duration = Math.floor(stat.duration / 1000 / 60);
            return `${mark} <@${stat.userId}>: ${duration}分${memo}`;
          })
          .join('\n') || 'なし',
    });

  const components = [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`event_component_show_${event.id}`)
        .setPlaceholder('参加した人を選択')
        .setMinValues(0)
        .setMaxValues(25)
        // まだステータスが未設定のユーザーをデフォルトで選択
        .setDefaultUsers(
          stats.filter((stat) => stat.show === null).map((stat) => stat.userId),
        ),
    ),
    // 除外プルダウン
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`event_component_hide_${event.id}`)
        .setPlaceholder('参加していない人を選択')
        .setMinValues(0)
        .setMaxValues(25)
        // まだステータスが未設定のユーザーをデフォルトで選択
        .setDefaultUsers(
          stats.filter((stat) => stat.show === null).map((stat) => stat.userId),
        ),
    ),
  ];

  // イベントの出欠状況を表示
  await interaction.editReply({
    embeds: [embeds],
    components,
  });
}

async function setShowStats(
  event: Event,
  userIds: string[] | undefined,
  isShow: boolean | null,
): Promise<void> {
  // ユーザーの出欠状況を更新
  await prisma.userStat.updateMany({
    where: {
      eventId: event.id,
      userId: {
        in: userIds,
      },
    },
    data: {
      show: isShow,
    },
  });
}

async function getEventFromId(
  eventId: number | undefined,
): Promise<Event | null> {
  return await prisma.event.findFirst({
    where: {
      id: eventId,
    },
    orderBy: {
      startTime: 'desc',
    },
    take: 1,
  });
}

async function showUserStatus(
  interaction: RepliableInteraction,
  userId: string,
): Promise<void> {
  // ユーザーの過去のイベント参加状況を表示
  const stats = await prisma.userStat.findMany({
    where: {
      userId,
      show: true,
    },
    include: {
      event: true,
    },
  });

  // 全イベント数を取得
  const eventCount = await prisma.event.count({
    where: {
      endTime: {
        not: null,
      },
    },
  });

  // ユーザーを取得
  const user = await interaction.guild?.members.fetch(userId);

  const embeds = new EmbedBuilder()
    .setTitle('イベント参加状況')
    .setDescription(`<@${userId}> さんの過去のイベント参加状況です`)
    .setAuthor(
      !user
        ? null
        : {
            name: user.displayName,
            iconURL: user.displayAvatarURL() ?? undefined,
          },
    )
    .setColor('#ff8c00')
    .addFields({
      name: '参加イベント数',
      value: `${stats.length} / ${eventCount} 回`,
    })
    .addFields({
      name: '参加イベントリスト',
      value:
        stats
          .map((stat) => {
            if (!stat.event) return '- 不明';
            return `- [${stat.event.name}](https://discord.com/events/${config.guild_id}/${stat.event.eventId})`;
          })
          .join('\n') || 'なし',
    })
    .addFields({
      name: 'ゲーム戦績',
      value: await getUserGameResults(userId),
    });

  await interaction.editReply({
    embeds: [embeds],
  });
}

/**
 * イベントコマンドを処理します
 * @param interaction インタラクション
 */
export async function onInteractionCreate(
  interaction: Interaction,
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      // コマンドによって処理を分岐
      switch (interaction.commandName) {
        // 管理者用コマンド
        case eventCommand.name: {
          // サブコマンドによって処理を分岐
          switch (interaction.options.getSubcommand()) {
            case 'show': {
              await interaction.deferReply({ ephemeral: false });
              const eventId = interaction.options.getInteger('event_id');
              const event = await getEventFromId(eventId ?? undefined);
              if (!event) {
                await interaction.editReply({
                  content: 'イベントが見つかりませんでした',
                });
                return;
              }
              await showEvent(interaction, event);
              break;
            }
            case 'review': {
              // 公開前のメンバー確認
              await interaction.deferReply({ ephemeral: true });
              const eventId = interaction.options.getInteger('event_id');
              const event = await getEventFromId(eventId ?? undefined);
              if (!event) {
                await interaction.editReply({
                  content: 'イベントが見つかりませんでした',
                });
                return;
              }
              await reviewEvent(interaction, event);
              break;
            }
            case 'status': {
              // ステータス確認
              await interaction.deferReply({ ephemeral: true });
              const user =
                interaction.options.getUser('user') ?? interaction.user;
              await showUserStatus(interaction, user.id);
              break;
            }
            case 'start': {
              // イベントを開始
              await interaction.deferReply({ ephemeral: true });
              const eventId = interaction.options.getString('discord_event_id');
              const scheduledEvent = !eventId
                ? undefined
                : await interaction.guild?.scheduledEvents.fetch(eventId);
              if (!scheduledEvent) {
                await interaction.editReply({
                  content: 'Discordイベントが見つかりませんでした',
                });
                return;
              }
              const event = await startEvent(scheduledEvent);
              if (!event) {
                await interaction.editReply({
                  content: 'イベントの開始に失敗しました',
                });
                return;
              }
              await interaction.editReply({
                content: `イベント「${scheduledEvent.name}」(ID: ${event.id})を開始しました`,
              });
              break;
            }
            case 'stop': {
              // イベントを終了
              await interaction.deferReply({ ephemeral: true });
              const eventId = interaction.options.getInteger('event_id');
              const event = await getEventFromId(eventId ?? undefined);
              if (!event) {
                await interaction.editReply({
                  content: 'イベントが見つかりませんでした',
                });
                return;
              }
              const scheduledEvent = !event
                ? undefined
                : await interaction.guild?.scheduledEvents.fetch(event.eventId);
              if (!scheduledEvent) {
                await interaction.editReply({
                  content: 'Discordイベントが見つかりませんでした',
                });
                return;
              }
              await endEvent(scheduledEvent);
              await interaction.editReply({
                content: `イベント「${scheduledEvent.name}」(ID: ${event.id})を終了しました`,
              });
              break;
            }
            case 'update': {
              // イベント情報を更新
              await interaction.deferReply({ ephemeral: true });
              const eventId = interaction.options.getInteger('event_id');
              const event = await getEventFromId(eventId ?? undefined);
              if (!event) {
                await interaction.editReply({
                  content: 'イベントが見つかりませんでした',
                });
                return;
              }
              const scheduledEvent = !event
                ? undefined
                : await interaction.guild?.scheduledEvents.fetch(event.eventId);
              if (!scheduledEvent) {
                await interaction.editReply({
                  content: 'Discordイベントが見つかりませんでした',
                });
                return;
              }
              await updateEvent(scheduledEvent);
              await interaction.editReply({
                content: `イベント「${scheduledEvent.name}」(ID: ${event.id})の情報を更新しました`,
              });
              break;
            }
            case 'game': {
              // ゲームの勝敗を記録
              await interaction.deferReply({ ephemeral: false });
              const eventId = interaction.options.getInteger('event_id');
              const event = await getEventFromId(eventId ?? undefined);
              if (!event) {
                await interaction.editReply({
                  content: 'イベントが見つかりませんでした',
                });
                return;
              }
              await addGameResult(interaction, event);
              break;
            }
          }
          break;
        }
        // 確認用コマンド
        case statusCommand.name: {
          switch (interaction.options.getSubcommand()) {
            case 'user': {
              // ユーザーの過去のイベント参加状況を表示
              const show = interaction.options.getBoolean('show') ?? false;
              await interaction.deferReply({ ephemeral: !show });
              const user =
                interaction.options.getUser('user') ?? interaction.user;
              await showUserStatus(interaction, user.id);
              break;
            }
            case 'event': {
              // イベントの出欠状況を表示
              const show = interaction.options.getBoolean('show') ?? false;
              await interaction.deferReply({ ephemeral: !show });
              const eventId = interaction.options.getInteger('event_id');
              const event = await getEventFromId(eventId ?? undefined);
              if (!event) {
                await interaction.editReply({
                  content: 'イベントが見つかりませんでした',
                });
                return;
              }
              await showEvent(interaction, event);
              break;
            }
            case 'game': {
              // ゲームの勝敗を表示
              const show = interaction.options.getBoolean('show') ?? false;
              await interaction.deferReply({ ephemeral: !show });
              const gameId = interaction.options.getInteger('game_id');
              const game = await prisma.gameResult.findFirst({
                where: {
                  id: gameId ?? undefined,
                },
              });
              if (!game) {
                await interaction.editReply({
                  content: '試合が見つかりませんでした',
                });
                return;
              }
              await showGameResults(interaction, game.id);
              break;
            }
          }
          break;
        }
      }
    } else if (interaction.isUserContextMenuCommand()) {
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
    console.error('onInteractionCreate中にエラーが発生しました。', error);
  }
}
