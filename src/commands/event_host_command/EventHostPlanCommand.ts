import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  GuildScheduledEvent,
  GuildScheduledEventStatus,
  Collection,
  InteractionEditReplyOptions,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventHostCommand from './EventHostCommand.js';
import { prisma } from '../../utils/prisma.js';
import { Event, User } from '@prisma/client';
import eventManager from '../../event/EventManager.js';
import planEventSelectAction from '../action/event_host_command/PlanEventSelectAction.js';
import planSetupAllButtonAction from '../action/event_host_command/PlanSetupAllButtonAction.js';
import planCancelButtonAction from '../action/event_host_command/PlanCancelButtonAction.js';
import { config } from '../../utils/config.js';

/**
 * 主催者お伺いワークフロー計画の設定データ
 */
export interface PlanSetupData {
  /** キー */
  key: string;
  /** イベントID */
  eventId: number;
  /** 選択可能なユーザー一覧 */
  availableUsers: User[];
  /** 候補者（1～3番手） */
  candidates: User[];
  /** 並行して公募するか */
  allowPublicApply: boolean;
  /** 依頼メッセージ */
  customMessage: string;
}

/**
 * 主催者お伺いワークフローの計画作成コマンド
 * /event_host plan
 */
class EventHostPlanCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('plan')
    .setDescription('主催者お伺いワークフローの計画を作成します')
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？（デフォルトは非公開）',
        )
        .setRequired(false),
    );

  /** 設定データ */
  private _setupData: Record<string, PlanSetupData> = {};
  /** イベント一覧 */
  private _scheduledEvents:
    | Collection<string, GuildScheduledEvent<GuildScheduledEventStatus>>
    | undefined;

  async onCommand(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const show = interaction.options.getBoolean('show') ?? true;
    await interaction.deferReply({ ephemeral: !show });

    // イベントを取得してキャッシュしておく。プルダウンメニューを選んだときなどは取得する代わりにキャッシュを使う
    this._scheduledEvents = await interaction.guild?.scheduledEvents.fetch();

    // パネルを作成
    const reply = await this._createPlanningPanel(interaction);
    if (!reply) return;
    await interaction.editReply(reply);
  }

  /**
   * 計画作成パネルを表示
   * @param interaction インタラクション
   * @returns Promise<void>
   */
  private async _createPlanningPanel(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<InteractionEditReplyOptions | undefined> {
    const scheduledEvents = this._scheduledEvents;
    if (!scheduledEvents || scheduledEvents.size === 0) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // イベント一覧を取得
    const eventSpecs = await eventManager.getEventSpecs(
      scheduledEvents,
      GuildScheduledEventStatus.Scheduled,
    );

    // 主催者が決まっていないイベントのみフィルタリング
    const eventsWithoutHost = eventSpecs.filter(
      (eventSpec) => !eventSpec.event?.hostId,
    );

    if (eventsWithoutHost.length === 0) {
      await interaction.editReply({
        content: '主催者が決まっていないイベントが見つかりませんでした。',
      });
      return;
    }

    // イベントとイベント主催者の表を表示
    const eventTable = eventSpecs
      .map(({ event, scheduledEvent }) => {
        const date = event?.scheduleTime ?? scheduledEvent.scheduledStartAt;
        const dateStr = date
          ? `<t:${Math.floor(date.getTime() / 1000)}:D>`
          : '未定';
        const eventInfo = `${dateStr} [「${event?.name ?? scheduledEvent?.name ?? '？'}」(ID: ${event?.id ?? '？'})](https://discord.com/events/${config.guild_id}/${scheduledEvent.id})`;
        const hostInfo = event
          ? event.host?.userId
            ? `<@${event.host.userId}>`
            : '主催者なし'
          : 'イベント未生成';
        return `${eventInfo}: ${hostInfo}`;
      })
      .join('\n');

    // パネルを作成
    const embed = new EmbedBuilder()
      .setTitle('🎯 主催者お伺いワークフロー計画作成')
      .setDescription(
        '主催者が決まっていないイベントが見つかりました。\n' +
          'お伺いワークフローを作成するイベントを選択してください。\n\n' +
          eventTable,
      )
      .setColor(0x3498db);

    // イベント選択メニューを作成
    const events = eventsWithoutHost
      .map((spec) => spec.event)
      .filter(
        (event): event is NonNullable<typeof event> => event !== undefined,
      );
    const eventSelectMenu = planEventSelectAction.create(events);

    // ボタンを作成
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      planSetupAllButtonAction.create(),
      planCancelButtonAction.create(),
    );

    const selectRow =
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        eventSelectMenu,
      );

    return {
      embeds: [embed],
      components: [selectRow, buttons],
    };
  }

  /**
   * 設定データを取得・初期化
   * @param key キー
   * @param eventId イベントID
   * @param clear 設定データをクリアするか
   * @returns 設定データ
   */
  async getSetupData(
    key: string,
    eventId: number,
    clear = false,
  ): Promise<PlanSetupData> {
    // 設定データを取得
    let setupData: PlanSetupData | undefined = this._setupData[key];

    // 設定データがない場合は新規作成
    if (!setupData || clear) {
      // 設定データを作成
      this._setupData[key] = setupData = {
        key,
        eventId,
        availableUsers: [],
        candidates: [],
        allowPublicApply: false,
        customMessage: 'よろしくお願いいたします。',
      };
    }

    // イベントIDが異なる場合は初期化
    if (setupData.eventId !== eventId) {
      setupData.eventId = eventId;
      setupData.candidates = [];
      setupData.allowPublicApply = false;
      setupData.customMessage = 'よろしくお願いいたします。';
    }

    // 選択可能なユーザー一覧を取得（参加者から）
    if (setupData.availableUsers.length === 0) {
      setupData.availableUsers = (
        await prisma.userStat.findMany({
          where: {
            eventId,
            show: true,
          },
          include: {
            user: true,
          },
        })
      ).map((stat) => stat.user);
    }

    return setupData;
  }

  /**
   * 設定データを更新
   * @param setupData 設定データ
   * @param options 更新オプション
   */
  setSetupData(
    setupData: PlanSetupData,
    options: {
      /** 候補者（1～3番手） */
      candidates?: User[];
      /** 並行して公募するか */
      allowPublicApply?: boolean;
      /** 依頼メッセージ */
      customMessage?: string;
    },
  ): void {
    if (options.candidates !== undefined) {
      setupData.candidates = options.candidates;
    }
    if (options.allowPublicApply !== undefined) {
      setupData.allowPublicApply = options.allowPublicApply;
    }
    if (options.customMessage !== undefined) {
      setupData.customMessage = options.customMessage;
    }
  }

  /**
   * 設定パネルのEmbedを作成
   * @param event イベント
   * @param setupData 設定データ
   * @returns Embed
   */
  makeSetupEmbed(event: Event, setupData: PlanSetupData): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('🎯 主催者お伺いワークフロー設定')
      .setDescription(
        'ボタンを押して設定を行い、「確定」ボタンで計画を作成してください。',
      )
      .setColor(0x3498db);

    // イベント名を表示
    embed.addFields({
      name: 'イベント名',
      value: `${event.name}`,
      inline: false,
    });

    // 候補者を表示
    if (setupData.candidates.length > 0) {
      const candidateList = setupData.candidates
        .map((user, index) => `${index + 1}. <@${user.userId}>`)
        .join('\n');
      embed.addFields({
        name: '候補者（1～3番手）',
        value: candidateList,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '候補者（1～3番手）',
        value: '未設定',
        inline: false,
      });
    }

    // 並行公募の設定を表示
    embed.addFields({
      name: '並行公募',
      value: setupData.allowPublicApply ? 'はい' : 'いいえ',
      inline: true,
    });

    // 依頼メッセージを表示
    embed.addFields({
      name: '依頼メッセージ',
      value: setupData.customMessage || '（デフォルト）',
      inline: false,
    });

    return embed;
  }
}

/**
 * EventHostPlanCommandのインスタンス
 */
export default new EventHostPlanCommand(eventHostCommand);
