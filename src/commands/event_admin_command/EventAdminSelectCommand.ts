import {
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventManager from '../../event/EventManager.js';
import eventAdminCommand from './EventAdminCommand.js';
import EventManager from '../../event/EventManager.js';

class EventAdminSelectCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('select')
    .setDescription(
      '設定するイベントを切り替えます。この切り替えは、自分のみ、次のイベントを開始するまで有効です',
    )
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription('イベントID (省略時は最新のイベントを表示)')
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを終了
    await interaction.deferReply({ ephemeral: true });
    const eventId = interaction.options.getInteger('event_id') ?? undefined;
    let eventName = 'デフォルト';
    if (eventId) {
      const event = await eventManager.getEventFromId(eventId);
      eventName = event?.name ? `「${event.name}」` : `ID:${eventId}`;
      if (!event) {
        await interaction.editReply({
          content: 'イベントが見つかりませんでした',
        });
        return;
      }
    }
    EventManager.selectEvent(interaction.user.id, eventId);
    await interaction.editReply({
      content: `イベントを ${eventName} に切り替えました`,
    });
  }
}

export default new EventAdminSelectCommand(eventAdminCommand);
