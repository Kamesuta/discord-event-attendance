import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventHostCommand from './EventHostCommand.js';
import { prisma } from '../../utils/prisma.js';
import { logger } from '../../utils/log.js';
import { Event, User } from '@prisma/client';
import planEventSelectAction from '../action/event_host_command/PlanEventSelectAction.js';
import planSetupAllButtonAction from '../action/event_host_command/PlanSetupAllButtonAction.js';
import planCancelButtonAction from '../action/event_host_command/PlanCancelButtonAction.js';

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
    .addStringOption((option) =>
      option
        .setName('period')
        .setDescription('対象期間（例：今週、来週、1/20-1/27）')
        .setRequired(false),
    )
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

  /**
   * コマンド実行
   * @param interaction インタラクション
   * @returns Promise<void>
   */
  async onCommand(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const show = interaction.options.getBoolean('show') ?? true;
    await interaction.deferReply({ ephemeral: !show });

    try {
      // 対象期間の解析（省略時は来週）
      const _period = interaction.options.getString('period') ?? '来週';

      // 主催者が決まっていないイベントを取得
      const eventsWithoutHost = await this._getEventsWithoutHost();

      if (eventsWithoutHost.length === 0) {
        await interaction.editReply({
          content: '主催者が決まっていないイベントが見つかりませんでした。',
        });
        return;
      }

      // 計画作成パネルを表示
      await this._showPlanningPanel(interaction, eventsWithoutHost);
    } catch (error) {
      logger.error('主催者お伺いワークフロー計画作成でエラー:', error);
      await interaction.editReply({
        content:
          'エラーが発生しました。しばらく時間をおいて再試行してください。',
      });
    }
  }

  /**
   * 主催者が決まっていないイベントを取得
   * @returns 主催者なしイベント一覧
   */
  private async _getEventsWithoutHost(): Promise<Event[]> {
    // 簡単な実装として、スケジュール済みで主催者が決まっていないイベントを取得
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);

    const events = await prisma.event.findMany({
      where: {
        active: 1, // アクティブなイベント
        hostId: null, // 主催者が決まっていない
        scheduleTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        scheduleTime: 'asc',
      },
    });

    return events;
  }

  /**
   * 計画作成パネルを表示
   * @param interaction インタラクション
   * @param events 対象イベント一覧
   * @returns Promise<void>
   */
  private async _showPlanningPanel(
    interaction: ChatInputCommandInteraction<'cached'>,
    events: Event[],
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🎯 主催者お伺いワークフロー計画作成')
      .setDescription(
        '主催者が決まっていないイベントが見つかりました。\n' +
          'お伺いワークフローを作成するイベントを選択してください。',
      )
      .setColor(0x3498db);

    // イベント一覧を表示
    const eventListText = events
      .map((event, _index) => {
        const dateStr = event.scheduleTime
          ? new Date(event.scheduleTime).toLocaleDateString('ja-JP', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '未定';
        return `${_index + 1}. **${event.name}** (${dateStr})`;
      })
      .join('\\n');

    embed.addFields({
      name: '対象イベント一覧',
      value: eventListText || 'なし',
      inline: false,
    });

    // イベント選択メニューを作成
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

    await interaction.editReply({
      embeds: [embed],
      components: [selectRow, buttons],
    });
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
