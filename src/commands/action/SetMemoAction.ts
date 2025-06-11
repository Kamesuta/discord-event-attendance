import {
  ActionRowBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
  User,
} from 'discord.js';
import eventManager from '../../event/EventManager.js';
import { ModalActionInteraction } from '../base/action_base.js';
import { Event } from '@prisma/client';
import { prisma } from '../../index.js';
import userManager from '../../event/UserManager.js';

class SetMemoModalAction extends ModalActionInteraction {
  /**
   * メモ入力モーダルを作成
   * @param targetUser メモを設定するユーザー
   * @param event メモを設定するイベント
   * @param defaultMemo デフォルトのメモ
   * @returns 作成したビルダー
   */
  override create(
    targetUser: User,
    event: Event,
    defaultMemo: string,
  ): ModalBuilder {
    // カスタムIDを生成
    const customId = this.createCustomId({
      user: targetUser.id,
      event: `${event.id}`,
    });

    // 初期値を設定
    const textInput = new TextInputBuilder()
      .setCustomId('memo')
      .setLabel('メモを入力してください (「!」を入力で削除)')
      .setMinLength(0)
      .setMaxLength(512)
      .setStyle(TextInputStyle.Short)
      .setValue(defaultMemo);

    // ダイアログを作成
    return new ModalBuilder()
      .setTitle('メモ入力')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(textInput),
      )
      .setCustomId(customId);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ModalSubmitInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const userId = params.get('user');
    const eventId = params.get('event');
    if (!userId || !eventId) return; // 必要なパラメータがない場合は旧形式の可能性があるため無視

    await interaction.deferReply({ ephemeral: true });
    const event = await eventManager.getEventFromId(
      eventId ? parseInt(eventId) : undefined,
    );
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // ユーザーを作成 or 取得
    const member = await interaction.guild?.members
      .fetch(userId)
      .catch(() => undefined);
    if (!member) {
      await interaction.editReply({
        content: 'ユーザーが見つかりませんでした',
      });
      return;
    }
    const user = await userManager.getOrCreateUser(member);

    const memo = interaction.components[0]?.components[0]?.value;
    if (memo === undefined || memo === '' || memo === '!') {
      await prisma.userStat.update({
        where: {
          id: {
            eventId: event.id,
            userId: user.id,
          },
        },
        data: {
          memo: null,
        },
      });
      await interaction.editReply({
        content: 'メモを削除しました',
      });
    } else {
      await prisma.userStat.update({
        where: {
          id: {
            eventId: event.id,
            userId: user.id,
          },
        },
        data: {
          memo,
        },
      });
      await interaction.editReply({
        content: 'メモを更新しました',
      });
    }
  }
}

export default new SetMemoModalAction('memo');
