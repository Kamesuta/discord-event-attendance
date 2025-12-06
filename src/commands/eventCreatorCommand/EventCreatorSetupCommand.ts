import {
  ActionRowBuilder,
  ButtonBuilder,
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
import { SubcommandInteraction } from '@/commands/base/commandBase';
import { config } from '@/bot/config';
import { setupUserSelectAction } from '@/commands/action/eventSetupCommand/SetupUserSelectAction';
import { setupPreparerSelectAction } from '@/commands/action/eventSetupCommand/SetupPreparerSelectAction';
import { setupEventSelectAction } from '@/commands/action/eventSetupCommand/SetupEventSelectAction';
import { setupConfirmButtonAction } from '@/commands/action/eventSetupCommand/SetupConfirmButtonAction';
import { setupCancelButtonAction } from '@/commands/action/eventSetupCommand/SetupCancelButtonAction';
import { prisma } from '@/utils/prisma';
import { eventCreatorCommand } from './EventCreatorCommand';
import { eventIncludeHost, EventWithHost } from '@/domain/queries/eventQueries';

/**
 * 保留中の変更
 */
export interface PendingChange {
  /**
   * 主催者DiscordID
   */
  hostDiscordId?: string | null;
  /**
   * 準備者DiscordID
   */
  preparerDiscordId?: string | null;
}

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
  /**
   * 保留中の変更
   */
  pendingChange?: PendingChange;
}

/**
 * 設定中のデータ
 */
interface EditData {
  interaction: RepliableInteraction;
  selectedEvent: string;
  pendingChanges: Record<string, PendingChange>;
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

    const cachedEditData = this.setupPanels[this.key(interaction)];

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
        const pendingChange =
          cachedEditData?.pendingChanges[scheduledEvent.id] ?? undefined;

        return {
          scheduledEvent,
          event,
          pendingChange,
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
      .map((eventSpec) => this.formatEventSummary(eventSpec))
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
      pendingChanges: editData?.pendingChanges ?? {},
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
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          setupConfirmButtonAction.create(
            eventList.some((event) => Boolean(event.pendingChange)),
          ),
          setupCancelButtonAction.create(
            eventList.some((event) => Boolean(event.pendingChange)),
          ),
        ),
      ],
    };
  }

  formatEventSummary(eventSpec: EventSpec): string {
    const { event, scheduledEvent, pendingChange } = eventSpec;
    const date = event?.scheduleTime ?? scheduledEvent.scheduledStartAt;
    const dateStr = date
      ? `<t:${Math.floor(date.getTime() / 1000)}:D>`
      : '未定';
    const eventTitle = event?.name ?? scheduledEvent?.name ?? '？';
    const eventId = event?.id ?? '未生成';
    const changeMark = pendingChange ? ' 🟡' : '';
    const eventLink = `https://discord.com/events/${config.guild_id}/${scheduledEvent.id}`;
    const hostDiscordId = this.resolvePendingMemberDiscordId(
      event,
      pendingChange,
      'hostDiscordId',
    );
    const preparerDiscordId = this.resolvePendingMemberDiscordId(
      event,
      pendingChange,
      'preparerDiscordId',
    );
    const hostDisplay = hostDiscordId ? `<@${hostDiscordId}>` : 'なし';
    const summaryLines = [
      `### ${dateStr} [${eventTitle}](${eventLink}) (ID: ${eventId})${changeMark}`,
      `- 主催者: ${hostDisplay}`,
    ];

    if (preparerDiscordId) {
      summaryLines.push(`- 準備者: <@${preparerDiscordId}>`);
    }

    return summaryLines.join('\n');
  }

  resolvePendingMemberDiscordId(
    event: EventWithHost | undefined,
    pendingChange: PendingChange | undefined,
    key: keyof PendingChange,
  ): string | null {
    const currentDiscordId =
      key === 'hostDiscordId'
        ? (event?.host?.userId ?? null)
        : (event?.preparer?.userId ?? null);

    if (pendingChange?.[key] === undefined) {
      return currentDiscordId;
    }

    return pendingChange[key] ?? null;
  }

  updatePendingChanges(
    editData: EditData,
    eventId: string,
    change: PendingChange,
    baseEvent?: EventWithHost | null,
  ): void {
    const currentHostDiscordId = baseEvent?.host?.userId ?? null;
    const currentPreparerDiscordId = baseEvent?.preparer?.userId ?? null;
    const previousPending = editData.pendingChanges[eventId] ?? {};

    const nextHostDiscordId =
      change.hostDiscordId !== undefined
        ? change.hostDiscordId
        : previousPending.hostDiscordId;
    const nextPreparerDiscordId =
      change.preparerDiscordId !== undefined
        ? change.preparerDiscordId
        : previousPending.preparerDiscordId;

    const pending: PendingChange = {};

    if (
      nextHostDiscordId !== undefined &&
      nextHostDiscordId !== currentHostDiscordId
    ) {
      pending.hostDiscordId = nextHostDiscordId ?? null;
    }

    if (
      nextPreparerDiscordId !== undefined &&
      nextPreparerDiscordId !== currentPreparerDiscordId
    ) {
      pending.preparerDiscordId = nextPreparerDiscordId ?? null;
    }

    if (
      pending.hostDiscordId === undefined &&
      pending.preparerDiscordId === undefined
    ) {
      delete editData.pendingChanges[eventId];
      return;
    }

    editData.pendingChanges[eventId] = pending;
  }
}

/**
 * EventCreatorSetupCommandのインスタンス
 */
export const eventCreatorSetupCommand = new EventCreatorSetupCommand(
  eventCreatorCommand,
);
