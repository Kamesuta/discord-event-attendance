import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
  GuildScheduledEventStatus,
} from 'discord.js';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import { prisma } from '@/utils/prisma';
import { eventIncludeHost, EventWithHost } from '@/domain/queries/eventQueries';
import { checkCommandPermission } from '@/bot/permissions/checkCommandPermission';
import { userManager } from '@/domain/services/UserManager';
import { preparationStatusToggleSelectAction } from './PreparationStatusToggleSelectAction';

class PreparationStatusReportButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  override create(): ButtonBuilder {
    const customId = this.createCustomId();

    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('準備完了報告をする')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Primary);
  }

  /** @inheritdoc */
  async onCommand(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild?.members
      .fetch(interaction.user.id)
      .catch(() => undefined);
    if (!member) {
      await interaction.editReply({
        content: 'メンバー情報を取得できませんでした。',
      });
      return;
    }

    const canViewAll = await checkCommandPermission('event_creator', member);

    // 対象イベントを取得
    let events: EventWithHost[] = [];
    if (canViewAll) {
      events = await prisma.event.findMany({
        where: {
          active: GuildScheduledEventStatus.Scheduled,
          preparerId: { not: null },
        },
        orderBy: [{ scheduleTime: 'asc' }],
        ...eventIncludeHost,
      });
    } else {
      const user = await userManager.getOrCreateUser(member);
      events = await prisma.event.findMany({
        where: {
          active: GuildScheduledEventStatus.Scheduled,
          preparerId: user.id,
        },
        orderBy: [{ scheduleTime: 'asc' }],
        ...eventIncludeHost,
      });
    }

    if (events.length === 0) {
      await interaction.editReply({ content: '対象のイベントがありません。' });
      return;
    }

    // セレクトメニューを作成（最大25件）
    const select: StringSelectMenuBuilder =
      preparationStatusToggleSelectAction.create(events.slice(0, 25));

    const message =
      '準備完了報告をするイベントを選択してください。' +
      (canViewAll ? '\n-# 権限により全てのイベントを表示しています。' : '');

    await interaction.editReply({
      content: message,
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      ],
    });
  }
}

/**
 * PreparationStatusReportButtonActionのインスタンス
 */
export const preparationStatusReportButtonAction =
  new PreparationStatusReportButtonAction('prep_report', ComponentType.Button);
