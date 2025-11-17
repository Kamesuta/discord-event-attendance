import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  Collection,
  EmbedBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  InteractionEditReplyOptions,
  RepliableInteraction,
  SlashCommandSubcommandBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/commandBase.js';
import { config } from '../../bot/config.js';
import { setupUserSelectAction } from '../action/eventSetupCommand/SetupUserSelectAction.js';
import { setupPreparerSelectAction } from '../action/eventSetupCommand/SetupPreparerSelectAction.js';
import { setupEventSelectAction } from '../action/eventSetupCommand/SetupEventSelectAction.js';
import { prisma } from '../../utils/prisma.js';
import { eventCreatorCommand } from './EventCreatorCommand.js';
import {
  eventIncludeHost,
  EventWithHost,
} from '../../domain/queries/eventQueries.js';

/**
 * イベント情報
 */
export interface EventSpec {
  /**
   * Discordイベント
   */
  scheduledEvent: GuildScheduledEvent;
  /**
   * イベント
   */
  event?: EventWithHost;
}

/**
 * 設定中のデータ
 */
interface EditData {
  interaction: RepliableInteraction;
  selectedEvent: string;
}

class EventCreatorSetupCommand extends SubcommandInteraction {
  setupPanels: Record<string, EditData> = {};
  scheduledEvents:
    | Collection<string, GuildScheduledEvent<GuildScheduledEventStatus>>
    | undefined;

  command = new SlashCommandSubcommandBuilder()
    .setName('setup')
    .setDescription('1週間分のイベントの主催者と準備者を設定します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // イベントを取得してキャッシュしておく。プルダウンメニューを選んだときなどは取得する代わりにキャッシュを使う
    this.scheduledEvents = await interaction.guild?.scheduledEvents.fetch();

    // パネルを作成
    const reply = await this.createSetupPanel(interaction);
    if (!reply) return;
    await interaction.editReply(reply);
  }

  /**
   * キーを取得
   * @param interaction インタラクション (ユーザー特定用)
   * @returns キー
   */
  key(interaction: RepliableInteraction): string {
    return new URLSearchParams({
      user: interaction.user.id,
      channel: `${interaction.channel?.id}`,
    }).toString();
  }

  /**
   * セットアップパネルを作成
   * @param interaction インタラクション
   * @returns 作成したパネル
   */
  async createSetupPanel(
    interaction: RepliableInteraction,
  ): Promise<InteractionEditReplyOptions | undefined> {
    const scheduledEvents = this.scheduledEvents;
    if (!scheduledEvents || scheduledEvents.size === 0) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // イベントを取得
    const events = await prisma.event.findMany({
      where: {
        eventId: {
          in: scheduledEvents.map((event) => event.id),
        },
        active: GuildScheduledEventStatus.Scheduled,
      },
      ...eventIncludeHost,
    });
    const eventList: EventSpec[] = scheduledEvents
      .map((scheduledEvent) => {
        const event = events.find((e) => e.eventId === scheduledEvent.id);
        return {
          scheduledEvent,
          event,
        };
      })
      .sort(
        (a, b) =>
          (a.event?.scheduleTime?.getTime() ??
            a.scheduledEvent.scheduledStartTimestamp ??
            0) -
          (b.event?.scheduleTime?.getTime() ??
            b.scheduledEvent.scheduledStartTimestamp ??
            0),
      );

    // イベントとイベント主催者の表を表示
    const eventTable = eventList
      .map(({ event, scheduledEvent }) => {
        const date = event?.scheduleTime ?? scheduledEvent.scheduledStartAt;
        const dateStr = date
          ? `<t:${Math.floor(date.getTime() / 1000)}:D>`
          : '未定';
        const eventInfo = `${dateStr} [「${event?.name ?? scheduledEvent?.name ?? '？'}」(ID: ${event?.id ?? '？'})](https://discord.com/events/${config.guild_id}/${scheduledEvent.id})`;
        const hostName = event?.host?.userId
          ? `<@${event.host.userId}>`
          : 'なし';
        const preparerDisplay = event?.preparer?.userId
          ? ` / 準備者: <@${event.preparer.userId}>`
          : '';

        return `${eventInfo}: 主催者: ${hostName}${preparerDisplay}`;
      })
      .join('\n');

    // パネルを作成
    const embed = new EmbedBuilder()
      .setTitle('🥳イベント主催者設定パネル')
      .setDescription(eventTable)
      .setColor('#ff8c00');

    // パネル読み込み
    let editData = this.setupPanels[this.key(interaction)];

    // パネルを保存
    this.setupPanels[this.key(interaction)] = editData = {
      interaction,
      selectedEvent:
        editData?.selectedEvent ?? eventList[0]?.scheduledEvent.id ?? '',
    };

    // 選択中のイベントを取得
    const selectedEvent = eventList.find(
      ({ scheduledEvent }) => scheduledEvent.id === editData?.selectedEvent,
    );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          setupEventSelectAction.create(eventList, selectedEvent),
        ),
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          setupUserSelectAction.create(selectedEvent),
        ),
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          setupPreparerSelectAction.create(selectedEvent),
        ),
      ],
    };
  }
}

/**
 * EventCreatorSetupCommandのインスタンス
 */
export const eventCreatorSetupCommand = new EventCreatorSetupCommand(
  eventCreatorCommand,
);
