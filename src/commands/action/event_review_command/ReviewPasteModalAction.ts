import {
  ActionRowBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { eventManager } from '../../../event/EventManager.js';
import { ModalActionInteraction } from '../../base/action_base.js';
import { Event } from '@prisma/client';
import { prisma } from '../../../utils/prisma.js';
import { eventReviewCommand } from '../../event_command/EventReviewCommand.js';

/**
 * IDをペーストするモーダルアクション
 */
class ReviewPasteModalAction extends ModalActionInteraction {
  /**
   * モーダルを作成
   * @param event イベント
   * @returns 作成したビルダー
   */
  override create(event: Event): ModalBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      event: `${event.id}`,
    });

    // IDリスト入力フィールド
    const idsInput = new TextInputBuilder()
      .setCustomId('ids')
      .setRequired(true)
      .setLabel('IDまたはユーザー名（1行1つ）')
      .setMinLength(1)
      .setMaxLength(4000)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('<IDまたはユーザー名>\n123456789012345678\nusername1');

    // モーダルを作成
    return new ModalBuilder()
      .setTitle('IDをペーストして出席をマーク')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(idsInput),
      )
      .setCustomId(customId);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ModalSubmitInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('event');
    if (!eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    const idsText = interaction.components[0]?.components[0]?.value;
    if (!idsText || !idsText.trim()) {
      await interaction.reply({
        ephemeral: true,
        content: 'IDまたはユーザー名を入力してください',
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // イベントを取得
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 1行1つでIDまたはユーザー名を分割
    const ids = idsText
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 && !line.startsWith('#') && !line.startsWith('//'),
      );

    if (ids.length === 0) {
      await interaction.editReply({
        content: '有効なIDまたはユーザー名が見つかりませんでした',
      });
      return;
    }

    try {
      // DiscordからユーザーIDを解決
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply({
          content: 'ギルド情報が取得できませんでした',
        });
        return;
      }

      const userIds: string[] = [];
      const notFoundIds: string[] = [];

      for (const id of ids) {
        try {
          let userId: string | null = null;

          // まずIDとして試す
          if (/^\d{17,19}$/.test(id)) {
            // Discord IDの形式（17-19桁の数字）の場合
            const member = await guild.members.fetch(id).catch(() => null);
            if (member) {
              userId = id;
            }
          }

          // IDで見つからない場合はユーザー名で検索
          if (!userId) {
            const members = await guild.members.fetch();
            const member = members.find(
              (m) => m.user.username === id || m.displayName === id,
            );
            if (member) {
              userId = member.user.id;
            }
          }

          if (userId) {
            userIds.push(userId);
          } else {
            notFoundIds.push(id);
          }
        } catch (_error) {
          notFoundIds.push(id);
        }
      }

      if (userIds.length === 0) {
        await interaction.editReply({
          content:
            '有効なユーザーが見つかりませんでした\n見つからなかったID/ユーザー名:\n' +
            notFoundIds.join('\n'),
        });
        return;
      }

      // ユーザー情報を取得またはDB登録
      const dbUserIds: number[] = [];
      for (const userId of userIds) {
        const user = await prisma.user.upsert({
          where: { userId },
          update: {},
          create: { userId },
        });
        dbUserIds.push(user.id);
      }

      // 履歴に保存
      await eventReviewCommand.addToHistory(interaction, event);

      // 出席としてマーク
      await eventReviewCommand.setShowStats(event, dbUserIds, true);

      // 結果を報告
      let message = `${userIds.length}人を☑️出席としてマークしました:\n`;
      message += userIds.map((id) => `<@${id}>`).join(' ');

      if (notFoundIds.length > 0) {
        message += `\n\n見つからなかったID/ユーザー名 (${notFoundIds.length}個):\n`;
        message += notFoundIds.join('\n');
      }

      await interaction.editReply({ content: message });

      // インタラクションが保存されている場合は更新
      const editData = eventReviewCommand.editDataHolder.get(
        interaction,
        event,
      );
      // イベントの出欠状況を表示するメッセージを作成
      const messageOption = await eventReviewCommand.createReviewEventMessage(
        interaction,
        event,
      );
      // 編集 または送信
      await editData.interaction.editReply(interaction, messageOption);
    } catch (error) {
      console.error('IDペースト処理でエラーが発生しました:', error);
      await interaction.editReply({
        content: 'エラーが発生しました。もう一度お試しください。',
      });
    }
  }
}

/**
 * ReviewPasteModalActionのインスタンス
 */
export const reviewPasteModalAction = new ReviewPasteModalAction('paste');
