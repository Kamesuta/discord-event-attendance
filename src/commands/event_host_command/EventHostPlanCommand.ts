import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventHostCommand from './EventHostCommand.js';
import { prisma } from '../../utils/prisma.js';
import { logger } from '../../utils/log.js';
import { Event } from '@prisma/client';

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

  /**
   * コマンド実行
   * @param interaction インタラクション
   * @returns Promise<void>
   */
  async onCommand(
    interaction: ChatInputCommandInteraction<'cached'>,
  ): Promise<void> {
    const show = interaction.options.getBoolean('show') ?? false;
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
        '主催者が決まっていないイベントが見つかりました。\\n' +
          'お伺いワークフローを作成するイベントを選択してください。',
      )
      .setColor(0x3498db)
      .setTimestamp();

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
    const eventSelectMenu = new StringSelectMenuBuilder()
      .setCustomId('host_plan_event_select')
      .setPlaceholder('計画を作成するイベントを選択...')
      .setMinValues(1)
      .setMaxValues(Math.min(events.length, 10)); // 最大10個まで

    // オプションを追加
    events.slice(0, 25).forEach((event, _index) => {
      // Discordの制限で最大25個
      const dateStr = event.scheduleTime
        ? new Date(event.scheduleTime).toLocaleDateString('ja-JP', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '未定';

      eventSelectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${event.name}`)
          .setDescription(`${dateStr} - ID: ${event.id}`)
          .setValue(event.id.toString()),
      );
    });

    // ボタンを作成
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('host_plan_setup_all')
        .setLabel('全てのイベントで計画作成')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId('host_plan_cancel')
        .setLabel('キャンセル')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌'),
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
}

/**
 * EventHostPlanCommandのインスタンス
 */
export default new EventHostPlanCommand(eventHostCommand);
