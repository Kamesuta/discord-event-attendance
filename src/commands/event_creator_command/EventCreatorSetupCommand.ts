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
import { SubcommandInteraction } from '../base/command_base.js';
import { config } from '../../utils/config.js';
import setupUserSelectAction from '../action/event_setup_command/SetupUserSelectAction.js';
import setupEventSelectAction from '../action/event_setup_command/SetupEventSelectAction.js';

import eventCreatorCommand from './EventCreatorCommand.js';
import eventManager, { EventSpec } from '../../event/EventManager.js';

/**
 * 設定中のデータ
 */
interface EditData {
  interaction: RepliableInteraction;
  selectedEvent: string;
}

class EventCreatorSetupCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('setup')
    .setDescription('1週間分のイベントの主催者を設定します')
    .addBooleanOption((option) =>
      option
        .setName('show')
        .setDescription(
          'コマンドの結果をチャットに表示しますか？（デフォルトは非公開）',
        )
        .setRequired(false),
    );

  /** 設定データ */
  setupPanels: Record<string, EditData> = {};
  /** イベント一覧 */
  scheduledEvents:
    | Collection<string, GuildScheduledEvent<GuildScheduledEventStatus>>
    | undefined;

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const show = interaction.options.getBoolean('show') ?? false;
    await interaction.deferReply({ ephemeral: !show });

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
    const eventSpecs: EventSpec[] = await eventManager.getEventSpecs(
      scheduledEvents,
      GuildScheduledEventStatus.Scheduled,
    );

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
      .setTitle('🥳イベント主催者設定パネル')
      .setDescription(eventTable)
      .setColor('#ff8c00');

    // パネル読み込み
    let editData = this.setupPanels[this.key(interaction)];

    // パネルを保存
    this.setupPanels[this.key(interaction)] = editData = {
      interaction,
      selectedEvent:
        editData?.selectedEvent ?? eventSpecs[0]?.scheduledEvent.id ?? '',
    };

    // 選択中のイベントを取得
    const selectedEvent = eventSpecs.find(
      ({ scheduledEvent }) => scheduledEvent.id === editData?.selectedEvent,
    );

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          setupEventSelectAction.create(eventSpecs, selectedEvent),
        ),
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          setupUserSelectAction.create(selectedEvent),
        ),
      ],
    };
  }
}

export default new EventCreatorSetupCommand(eventCreatorCommand);
