import {
  ComponentType,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { MessageComponentActionInteraction } from '../../base/action_base.js';
import {
  eventIncludeHost,
  EventWithHost,
} from '../../../domain/queries/eventQueries.js';
import { prisma } from '../../../utils/prisma.js';
import { checkCommandPermission } from '../../../bot/permissions/checkCommandPermission.js';
import { messageUpdateManager } from '../../../bot/client.js';
import { logger } from '../../../utils/log.js';

class PreparationStatusToggleSelectAction extends MessageComponentActionInteraction<ComponentType.StringSelect> {
  override create(events: EventWithHost[]): StringSelectMenuBuilder {
    const customId = this.createCustomId();

    const menu = new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('準備状況を切り替えるイベントを選択')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        events.map((event) => {
          const dateStr = event.scheduleTime
            ? new Date(event.scheduleTime).toLocaleDateString('ja-JP', {
                month: '2-digit',
                day: '2-digit',
                weekday: 'short',
              })
            : '未定';
          return {
            label: `${dateStr} ${event.name} (ID: ${event.id})`.slice(0, 100),
            value: `${event.id}`,
          };
        }),
      );

    return menu;
  }

  /** @inheritdoc */
  async onCommand(
    interaction: StringSelectMenuInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const eventId = parseInt(interaction.values[0] ?? '');
    if (!eventId) {
      await interaction.editReply({
        content: 'イベントが選択されていません。',
      });
      return;
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      ...eventIncludeHost,
    });

    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした。',
      });
      return;
    }

    // 権限チェック: event_creator or 自分が準備者
    const member = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => undefined);
    if (!member) {
      await interaction.editReply({
        content: 'メンバー情報を取得できませんでした。',
      });
      return;
    }

    const canAll = await checkCommandPermission('event_creator', member);
    const isPreparer = event.preparer?.userId === interaction.user.id;
    if (!canAll && !isPreparer) {
      await interaction.editReply({
        content: 'このイベントの準備者のみが変更できます。',
      });
      return;
    }

    // 準備者がいないイベントは完了にできない
    if (!event.preparerId) {
      await interaction.editReply({
        content:
          'このイベントには準備者が設定されていないため、準備完了にできません。',
      });
      return;
    }

    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { prepareStatus: !event.prepareStatus },
      ...eventIncludeHost,
    });

    // パネルなど関連メッセージの更新をスケジュール
    messageUpdateManager.enqueue(updated.id);
    logger.info(
      `準備状況変更によりイベント ${event.id} の関連メッセージ更新をスケジュール`,
    );

    // 連絡チャンネルに通知
    const contactChannelId = (await import('../../../bot/config.js')).config
      .event_contact_channel_id;
    const contactChannel =
      interaction.guild?.channels.cache.get(contactChannelId);
    if (contactChannel?.isTextBased()) {
      const statusText = updated.prepareStatus
        ? '準備を完了しました。'
        : '準備の完了を解除しました。';
      const dateStr = updated.scheduleTime
        ? `<t:${Math.floor(updated.scheduleTime.getTime() / 1000)}:D>`
        : '未定';
      await contactChannel.send({
        content: `<@${interaction.user.id}> が ${dateStr} 「${updated.name}」(ID: ${updated.id}) の${statusText}`,
        allowedMentions: { users: [] },
      });
    }

    await interaction.editReply({
      content: `「${updated.name}」(ID: ${updated.id}) の準備状況を ${
        updated.prepareStatus ? '✅ 準備完了' : '❌ 未完了'
      } にしました。`,
    });
  }
}

/**
 * PreparationStatusToggleSelectActionのインスタンス
 */
export const preparationStatusToggleSelectAction =
  new PreparationStatusToggleSelectAction(
    'prep_tgl',
    ComponentType.StringSelect,
  );
