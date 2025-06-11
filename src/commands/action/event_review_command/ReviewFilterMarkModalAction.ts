import {
  ActionRowBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import eventManager from '../../../event/EventManager.js';
import { ModalActionInteraction } from '../../base/action_base.js';
import { Event } from '@prisma/client';
import { prisma } from '../../../index.js';
import eventReviewCommand from '../../event_command/EventReviewCommand.js';
import { config } from '../../../utils/config.js';

class ReviewFilterMarkModalAction extends ModalActionInteraction {
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

    // 初期値を設定
    const requiredMinutesInput = new TextInputBuilder()
      .setCustomId('minutes')
      .setRequired(false)
      .setLabel('追加する人の最低分数')
      .setMinLength(0)
      .setMaxLength(3)
      .setStyle(TextInputStyle.Short)
      .setValue(`${config.required_time}`);

    // ダイアログを作成
    return new ModalBuilder()
      .setTitle('◯分以上参加している人を全員追加')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          requiredMinutesInput,
        ),
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

    const minutesText = interaction.components[0]?.components[0]?.value;
    const minutes = parseInt(minutesText);
    if (isNaN(minutes) || minutes < config.required_time) {
      await interaction.reply({
        ephemeral: true,
        content: '分数は10以上の数値で入力してください',
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

    // マークが付けられていない◯分以上参加のユーザーを取得
    const markUsers = await prisma.userStat.findMany({
      where: {
        eventId: event.id,
        duration: {
          gte: minutes * 1000 * 60,
        },
        show: null,
      },
      include: {
        user: true,
      },
    });

    // マークをつける
    await eventReviewCommand.addToHistory(interaction, event);
    await eventReviewCommand.setShowStats(
      event,
      markUsers.map((stat) => stat.userId),
      true,
    );
    await interaction.editReply({
      content: `${minutes} 分以上参加している ${markUsers
        .map((user) => `<@${user.user.userId}>`)
        .join('')} を☑️出席としてマークしました`,
    });

    // インタラクションが保存されている場合は更新
    const editData = eventReviewCommand.editDataHolder.get(interaction, event);
    // イベントの出欠状況を表示するメッセージを作成
    const messageOption = await eventReviewCommand.createReviewEventMessage(
      interaction,
      event,
    );
    // 編集 または送信
    await editData.interaction.editReply(interaction, messageOption);
  }
}

export default new ReviewFilterMarkModalAction('rfadd');
