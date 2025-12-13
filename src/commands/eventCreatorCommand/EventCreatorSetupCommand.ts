import {
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  Collection,
  EmbedBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  InteractionEditReplyOptions,
  MessageFlags,
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
import { setupTagEditAction } from '@/commands/action/eventSetupCommand/SetupTagEditAction';
import type { TagSuggestionInput } from '@/domain/tag/TagService';
import { EventTagData } from '@/domain/tag/EventTagData';

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
  tagData: EventTagData;
}

interface CreateSetupPanelOptions {
  forceRefreshAi?: boolean;
  skipAutoRefresh?: boolean;
}

class EventCreatorSetupCommand extends SubcommandInteraction {
  setupPanels: Record<string, EditData> = {};
  scheduledEvents:
    | Collection<string, GuildScheduledEvent<GuildScheduledEventStatus>>
    | undefined;

  command = new SlashCommandSubcommandBuilder()
    .setName('setup')
    .setDescription('1週間分のイベントの主催者と準備者を設定します')
    .addBooleanOption((option) =>
      option
        .setName('refresh_tag_suggestions')
        .setDescription('AIタグサジェストを再生成するか')
        .setRequired(false),
    );

  private _buildSuggestionInputs(eventList: EventSpec[]): TagSuggestionInput[] {
    return eventList.map((eventSpec) => ({
      eventId: eventSpec.scheduledEvent.id,
      title: eventSpec.event?.name ?? eventSpec.scheduledEvent.name,
      description:
        eventSpec.event?.description ?? eventSpec.scheduledEvent.description,
      currentTags: eventSpec.event?.tags?.map((tag) => tag.name) ?? [],
    }));
  }

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const refreshTagSuggestions =
      interaction.options.getBoolean('refresh_tag_suggestions') ?? false;

    // イベントを取得してキャッシュしておく。プルダウンメニューを選んだときなどは取得する代わりにキャッシュを使う
    this.scheduledEvents = await interaction.guild?.scheduledEvents.fetch();

    // パネルを作成
    const reply = await this.createSetupPanel(interaction, {
      forceRefreshAi: refreshTagSuggestions,
    });
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
   * @param options パネル作成オプション
   * @returns 作成したパネル
   */
  async createSetupPanel(
    interaction: RepliableInteraction,
    options?: CreateSetupPanelOptions,
  ): Promise<InteractionEditReplyOptions | undefined> {
    const forceRefreshAi = options?.forceRefreshAi ?? false;
    const skipAutoRefresh = options?.skipAutoRefresh ?? false;
    const scheduledEvents = this.scheduledEvents;
    if (!scheduledEvents || scheduledEvents.size === 0) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    const panelKey = this.key(interaction);
    const cachedEditData = this.setupPanels[panelKey];

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
          cachedEditData?.pendingChanges?.[scheduledEvent.id] ?? undefined;

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

    // パネル読み込み
    let editData = this.setupPanels[panelKey];

    // パネルを保存 (選択中のイベントとインタラクション)
    this.setupPanels[panelKey] = editData = {
      interaction,
      selectedEvent:
        editData?.selectedEvent ?? eventList[0]?.scheduledEvent.id ?? '',
      pendingChanges: editData?.pendingChanges ?? {},
      tagData: editData?.tagData ?? new EventTagData(),
    };

    const currentTagData = editData.tagData;
    editData.tagData.setAfterAiRefreshHook(async () => {
      const currentEditData = this.setupPanels[panelKey];
      if (!currentEditData || currentEditData.tagData !== currentTagData) {
        return;
      }
      const reply = await this.createSetupPanel(currentEditData.interaction, {
        skipAutoRefresh: true,
      });
      if (reply) {
        await currentEditData.interaction.editReply(reply);
      }
    });

    const suggestionInputs = this._buildSuggestionInputs(eventList);
    await editData.tagData.initialize(suggestionInputs, {
      forceRefreshAi,
      skipAutoRefresh,
    });

    // 選択中のイベントを取得
    const selectedEvent = eventList.find(
      ({ scheduledEvent }) => scheduledEvent.id === editData?.selectedEvent,
    );

    // イベントとイベント主催者の表を表示
    const eventTable = eventList
      .map((eventSpec) =>
        this.formatEventSummary(
          eventSpec,
          editData.tagData.getTagDisplay(eventSpec.scheduledEvent.id),
        ),
      )
      .join('\n');

    // パネルを作成
    const embed = new EmbedBuilder()
      .setTitle('🥳イベント主催者設定パネル')
      .setDescription(eventTable)
      .setColor('#ff8c00');

    const statusLine = editData.tagData.getStatusLine();
    if (statusLine) {
      embed.setFooter({ text: statusLine });
    }

    const hasPendingChanges = eventList.some((event) =>
      Boolean(event.pendingChange),
    );
    const hasPendingTags = editData.tagData.hasUnsavedChanges();
    const hasConfirmableChanges = hasPendingChanges || hasPendingTags;
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
          setupTagEditAction.create(selectedEvent),
          setupConfirmButtonAction.create(hasConfirmableChanges),
          setupCancelButtonAction.create(hasConfirmableChanges),
        ),
      ],
    };
  }

  formatEventSummary(eventSpec: EventSpec, tagDisplay: string): string {
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

    summaryLines.push(`- ${tagDisplay}`);

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
