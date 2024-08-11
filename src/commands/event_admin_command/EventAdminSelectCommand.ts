import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventManager from '../../event/EventManager.js';
import eventAdminCommand from './EventAdminCommand.js';
import EventManager from '../../event/EventManager.js';
import statusEventListCommand from '../status_command/StatusEventListCommand.js';

class EventAdminSelectCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('select')
    .setDescription(
      '設定するイベントを切り替えます。この切り替えは、自分のみ、次のイベントを開始するまで有効です',
    )
    .addIntegerOption((option) =>
      option
        .setName('event_id')
        .setDescription(
          'イベントID (省略時は最新のイベントを選択、0で選択解除)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを終了
    await interaction.deferReply({ ephemeral: true });
    const eventId = interaction.options.getInteger('event_id') ?? undefined;
    if (eventId === 0) {
      // 0が指定された場合はイベントを選択解除
      EventManager.selectEvent(interaction.user.id, undefined);
      // イベント情報を表示
      await interaction.editReply({
        content: `選択中のイベントをデフォルトに設定しました`,
        embeds: [await this._makeSuggestionEmbed()],
      });
      return;
    }

    const event = eventId
      ? // イベントIDが指定された場合はそのイベントを取得
        await eventManager.getEventFromId(eventId)
      : // イベントIDが指定されなかった場合は開催中のイベントを取得
        (await eventManager.getRecentEvent()) ??
        // 開催中のイベントがない場合は予定のイベントを取得
        (await eventManager.getRecentEvent(
          undefined,
          undefined,
          GuildScheduledEventStatus.Scheduled,
        )) ??
        // 開催中のイベントがない場合は終わったイベントを取得
        (await eventManager.getRecentEvent(
          undefined,
          undefined,
          GuildScheduledEventStatus.Completed,
        ));
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
        embeds: [await this._makeSuggestionEmbed()],
      });
      return;
    }

    // イベントを選択
    EventManager.selectEvent(interaction.user.id, event.id);
    // イベント情報を表示
    await interaction.editReply({
      content: `選択中のイベントを 「${event.name}」 (ID: ${event.id}) に設定しました`,
      embeds: [await this._makeSuggestionEmbed()],
    });
  }

  private async _makeSuggestionEmbed(): Promise<EmbedBuilder> {
    // イベント一覧のテキストを取得
    const eventListPast = await statusEventListCommand.getEventListText({
      active: GuildScheduledEventStatus.Completed,
      // 直近5日間
      startTime: { gt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    });
    const eventListActive = await statusEventListCommand.getEventListText({
      active: GuildScheduledEventStatus.Active,
    });
    const eventListFuture = await statusEventListCommand.getEventListText({
      active: GuildScheduledEventStatus.Scheduled,
      // 直近5日間
      scheduleTime: { gt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    });

    // Embed作成
    const embed = new EmbedBuilder().setTitle(`候補リスト`).setColor('#ff8c00');

    if (eventListActive.length > 0) {
      embed.addFields({
        name: '開催中のイベント',
        value: eventListActive.join('\n'),
      });
    }

    if (eventListFuture.length > 0) {
      embed.addFields({
        name: '予定のイベント',
        value: eventListFuture.join('\n'),
      });
    }

    if (eventListPast.length > 0) {
      embed.addFields({
        name: '終了したイベント',
        value: eventListPast.join('\n'),
      });
    }

    return embed;
  }
}

export default new EventAdminSelectCommand(eventAdminCommand);
