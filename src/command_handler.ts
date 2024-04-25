import {
  ActionRowBuilder,
  EmbedBuilder,
  Interaction,
  PermissionFlagsBits,
  RepliableInteraction,
  SlashCommandBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { client, prisma } from './index.js';
import { config } from './utils/config.js';
import { Event } from '@prisma/client';

/**
 * 出欠確認コマンド (イベント管理者用)
 */
export const eventCommand = new SlashCommandBuilder()
  .setDescription('出欠確認コマンド (イベント管理者用)')
  .setName('event')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('review')
      .setDescription('イベントの出欠状況を表示します (自分のみに表示)')
      .addStringOption((option) =>
        option
          .setName('event_id')
          .setDescription('イベントID (省略時は最新のイベントを表示)')
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('show')
      .setDescription('イベントの出欠状況を表示します')
      .addStringOption((option) =>
        option
          .setName('event_id')
          .setDescription('イベントID (省略時は最新のイベントを表示)')
          .setRequired(false)
      )
  );

/**
 * イベント参加状況を確認するコマンド
 */
export const statusCommand = new SlashCommandBuilder()
  .setDescription('イベント参加状況を確認するユーザー')
  .setName('status')
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('イベント参加状況を確認するユーザー')
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName('show')
      .setDescription(
        'コマンドの結果をチャットに表示しますか？ (デフォルトは非公開)'
      )
      .setRequired(false)
  );

/**
 * コマンドを登録します
 */
export async function registerCommands(): Promise<void> {
  // イベント管理者用のコマンドを登録
  const guild = await client.guilds.fetch(config.guild_id);
  await guild.commands.set([eventCommand, statusCommand]);
}

async function showEvent(
  interaction: RepliableInteraction,
  event: Event,
  publish = false
): Promise<void> {
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
          },
        });
        return [stat.userId, count] as const;
      })
    )
  );

  // イベントの時間を計算
  const duration = event.endTime
    ? ` (${
        Math.floor((event.endTime.getTime() - event.startTime.getTime()) / 1000 / 60)
      }分)`
    : '';

  const embeds = new EmbedBuilder()
    .setTitle(`🏁「${event.name}」イベントに参加してくれた人！`)
    .setURL(`https://discord.com/events/${config.guild_id}/${event.eventId}`)
    .setDescription(
      publish
        ? 'イベントの参加者を表示します\n(観戦していただけの人は欠席扱いです)'
        : '出席、欠席のステータスです。\n下のプルダウンからステータスを変更できます。'
    )
    .setColor('#ff8c00')
    .setFooter({
      text: '「/status <名前>」でユーザーの過去イベントの参加状況を確認できます',
    })
    .addFields({
      name: '開催日時',
      value: `${event.startTime.toLocaleString()} 〜 ${
        event.endTime?.toLocaleString() ?? '未定'
      } ${duration}`,
    })
    .addFields({
      name: '参加者',
      value: publish
        ? // 公開モードの場合は参加者のみ表示
          stats
            .filter((stat) => stat.show)
            .map((stat) => {
              const count = userCount[stat.userId];
              const countText = count === 1 ? '(🆕 初参加！)' : ` (${count}回目)`;
              return `<@${stat.userId}> ${countText}`;
            })
            .join('\n') || 'なし'
        : // 非公開モードの場合は全員表示 (現在のステータスも表示)
          stats
            .map((stat) => {
              const mark = stat.show === null ? '⬛' : stat.show ? '☑️' : '❌';
              const duration = Math.floor(stat.duration / 1000 / 60);
              return `${mark} <@${stat.userId}>: ${duration}分`;
            })
            .join('\n'),
    });

  const components = [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`event_component_show_${event.id}`)
        .setPlaceholder('参加した人を選択')
        .setMinValues(0)
        .setMaxValues(25)
        .setDefaultUsers(stats.map((stat) => stat.userId))
    ),
    // 除外プルダウン
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`event_component_hide_${event.id}`)
        .setPlaceholder('参加していない人を選択')
        .setMinValues(0)
        .setMaxValues(25)
        .setDefaultUsers(stats.map((stat) => stat.userId))
    ),
    // // その他を表示ボタン
    // new ActionRowBuilder<ButtonBuilder>().addComponents(
    //   new ButtonBuilder()
    //     .setCustomId(`event_component_showother_${event.id}`)
    //     .setLabel('その他を表示')
    //     .setStyle(ButtonStyle.Primary)
    // ),
  ];

  // イベントの出欠状況を表示
  await interaction.editReply({
    embeds: [embeds],
    components: publish ? [] : components,
  });
}

async function setShowStats(
  event: Event,
  userIds: string[] | undefined,
  isShow: boolean
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

async function getEvent(eventId: string | undefined): Promise<Event | null> {
  return await prisma.event.findFirst({
    where: {
      eventId,
    },
    orderBy: {
      startTime: 'desc',
    },
    take: 1,
  });
}

async function getEventFromId(
  eventId: number | undefined
): Promise<Event | null> {
  return await prisma.event.findFirst({
    where: {
      id: eventId,
    },
  });
}

async function showUserStatus(
  interaction: RepliableInteraction,
  userId: string
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
  const eventCount = await prisma.event.count();

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
          }
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
  interaction: Interaction
): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      // コマンドによって処理を分岐
      switch (interaction.commandName) {
        // 管理者用コマンド
        case eventCommand.name: {
          // サブコマンドによって処理を分岐
          let isShow = false;
          switch (interaction.options.getSubcommand()) {
            case 'show':
              isShow = true;
            // fallthrough
            case 'review': {
              await interaction.deferReply({ ephemeral: !isShow });
              const eventId = interaction.options.getString('event_id');
              const event = await getEvent(eventId ?? undefined);
              if (!event) {
                await interaction.editReply({
                  content: 'イベントが見つかりませんでした',
                });
                return;
              }
              await showEvent(interaction, event, isShow);
              break;
            }
            case 'status': {
              await interaction.deferReply({ ephemeral: true });
              const user =
                interaction.options.getUser('user') ?? interaction.user;
              await showUserStatus(interaction, user.id);
              break;
            }
          }
          break;
        }
        // 確認用コマンド
        case statusCommand.name: {
          const show = interaction.options.getBoolean('show') ?? false;
          await interaction.deferReply({ ephemeral: !show });
          const user = interaction.options.getUser('user') ?? interaction.user;
          await showUserStatus(interaction, user.id);
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
          eventId ? parseInt(eventId) : undefined
        );
        if (!event) {
          await interaction.editReply({
            content: 'イベントが見つかりませんでした',
          });
          return;
        }

        if (type === 'show' && interaction.isUserSelectMenu()) {
          await setShowStats(event, interaction.values, true);
          await showEvent(interaction, event);
        } else if (type === 'hide' && interaction.isUserSelectMenu()) {
          await setShowStats(event, interaction.values, false);
          await showEvent(interaction, event);
        } else if (type === 'showother' && interaction.isButton()) {
          await setShowStats(event, undefined, true);
          await showEvent(interaction, event);
        }
      }
    }
  } catch (error) {
    console.error('onInteractionCreate中にエラーが発生しました。', error);
  }
}
