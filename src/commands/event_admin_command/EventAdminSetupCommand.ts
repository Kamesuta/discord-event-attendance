import {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEvent,
  InteractionEditReplyOptions,
  RepliableInteraction,
  SlashCommandSubcommandBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventAdminCommand from './EventAdminCommand.js';
import eventManager from '../../event/EventManager.js';
import { Event } from '@prisma/client';
import { config } from '../../utils/config.js';
import setupUserSelectAction from '../action/event_setup_command/SetupUserSelectAction.js';

class EventAdminSetupCommand extends SubcommandInteraction {
  setupPanels: Record<string, RepliableInteraction> = {};

  command = new SlashCommandSubcommandBuilder()
    .setName('setup')
    .setDescription('1週間分のイベントの主催者を設定します');

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    // パネルを作成
    this.setupPanels[this.key(interaction)] = interaction;
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
    const scheduledEvents = await interaction.guild?.scheduledEvents.fetch();
    if (!scheduledEvents || scheduledEvents.size === 0) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // イベントを取得
    const eventList: [GuildScheduledEvent, Event | undefined][] =
      await Promise.all(
        scheduledEvents.map(async (discordEvent) => {
          const event = await eventManager.getEventFromDiscordId(
            discordEvent.id,
          );
          return [discordEvent, event ?? undefined];
        }),
      );

    // イベントとイベント主催者の表を表示
    const eventTable = eventList
      .map(([discordEvent, event]) => {
        const eventInfo = `[「${event?.name ?? discordEvent?.name ?? '？'}」(ID: ${event?.id ?? '？'})](https://discord.com/events/${config.guild_id}/${discordEvent.id})`;
        const hostInfo = event
          ? event.hostId
            ? `<@${event.hostId}>`
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

    return {
      embeds: [embed],
      components: eventList.flatMap(([_discordEvent, event]) => {
        if (!event) return [];
        return [
          new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
            setupUserSelectAction.create(event),
          ),
        ];
      }),
    };
  }
}

export default new EventAdminSetupCommand(eventAdminCommand);
