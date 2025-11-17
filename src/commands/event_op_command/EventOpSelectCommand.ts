import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildScheduledEventStatus,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import { eventManager } from '../../domain/services/EventManager.js';
import { statusEventListCommand } from '../status_command/StatusEventListCommand.js';
import { eventOpCommand } from './EventOpCommand.js';

class EventOpSelectCommand extends SubcommandInteraction {
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
    )
    .addBooleanOption((option) =>
      option
        .setName('suggest')
        .setDescription(
          '前後のイベント候補を表示しますか？ (デフォルトは非表示)',
        )
        .setRequired(false),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // イベントを終了
    await interaction.deferReply({ ephemeral: true });
    const suggest = interaction.options.getBoolean('suggest') ?? false;
    const embeds = suggest ? [await this._makeSuggestionEmbed()] : [];
    const eventId = interaction.options.getInteger('event_id') ?? undefined;

    if (eventId === 0) {
      // 0が指定された場合はイベントを選択解除
      eventManager.selectEvent(interaction.user.id, undefined);
      // デフォルト状態で選択されるイベントを取得
      const event = await eventManager.getEvent(interaction);
      // イベント情報を表示
      await interaction.editReply({
        content: `選択中のイベントをデフォルトに設定しました\n現在デフォルト状態で 「${event?.name ?? 'なし'}」 (ID: ${event?.id ?? 'なし'}) が取得されます`,
        embeds,
      });
      return;
    }

    const event = eventId
      ? // イベントIDが指定された場合はそのイベントを取得
        await eventManager.getEventFromId(eventId)
      : // イベントIDが指定されなかった場合は開催中のイベントを取得
        ((await eventManager.getRecentEvent()) ??
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
        )));
    if (!event) {
      await interaction.editReply({
        content:
          'イベントが見つかりませんでした\n`/event_admin select suggest:True` で候補を表示できます',
        embeds,
      });
      return;
    }

    // イベントを選択
    eventManager.selectEvent(interaction.user.id, event.id);
    // イベント情報を表示
    await interaction.editReply({
      content: `選択中のイベントを 「${event.name}」 (ID: ${event.id}) に設定しました`,
      embeds,
    });
  }

  private async _makeSuggestionEmbed(): Promise<EmbedBuilder> {
    // イベント一覧のテキストを取得
    const eventListPast = statusEventListCommand.getEventListText(
      await statusEventListCommand.getEvents({
        active: GuildScheduledEventStatus.Completed,
        // 直近5日間
        startTime: { gt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
      }),
    );
    const eventListActive = statusEventListCommand.getEventListText(
      await statusEventListCommand.getEvents({
        active: GuildScheduledEventStatus.Active,
      }),
    );
    const eventListFuture = statusEventListCommand.getEventListText(
      await statusEventListCommand.getEvents({
        active: GuildScheduledEventStatus.Scheduled,
        // 直近5日間
        scheduleTime: { gt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
      }),
    );

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

/**
 * EventOpSelectCommandのインスタンス
 */
export const eventOpSelectCommand = new EventOpSelectCommand(eventOpCommand);
