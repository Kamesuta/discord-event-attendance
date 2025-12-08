import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import { eventCreatorSetupCommand } from '@/commands/eventCreatorCommand/EventCreatorSetupCommand';
import { eventManager } from '@/domain/services/EventManager';
import {
  onCreateScheduledEvent,
  updateSchedules,
} from '@/handlers/eventHandler';
import { prisma } from '@/utils/prisma';
import { eventIncludeHost } from '@/domain/queries/eventQueries';
import { messageUpdateManager } from '@/bot/client';
import { logger } from '@/utils/log';
import { userManager } from '@/domain/services/UserManager';

class SetupConfirmButtonAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @param enabled 有効化するかどうか
   * @returns 作成したビルダー
   */
  override create(enabled: boolean): ButtonBuilder {
    const customId = this.createCustomId();

    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('変更を確定する')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!enabled);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const editKey = eventCreatorSetupCommand.key(interaction);
    const editData = eventCreatorSetupCommand.setupPanels[editKey];
    if (!editData) {
      await interaction.editReply({
        content: 'パネルが賞味期限切れです。もう一度出してやり直してください',
      });
      return;
    }

    const pendingEntries = Object.entries(editData.pendingChanges ?? {});
    if (pendingEntries.length === 0) {
      await interaction.editReply({ content: '確定する変更がありません。' });
      return;
    }

    const results: string[] = [];

    for (const [eventId, pending] of pendingEntries) {
      const scheduledEvent =
        eventCreatorSetupCommand.scheduledEvents?.get(eventId) ??
        (await interaction.guild?.scheduledEvents
          .fetch(eventId)
          .catch(() => undefined));

      let event = await eventManager.getEventFromDiscordId(eventId);
      if (!event) {
        if (!scheduledEvent) {
          results.push(
            `ID: ${eventId} のDiscordイベントが見つかりませんでした`,
          );
          continue;
        }
        event = (await onCreateScheduledEvent(scheduledEvent)) ?? null;
        if (!event) {
          results.push(`イベント(${eventId})の作成に失敗しました`);
          continue;
        }
      }

      const updateData: Parameters<typeof prisma.event.update>[0]['data'] = {};

      if (pending.hostDiscordId !== undefined) {
        if (pending.hostDiscordId === null) {
          updateData.hostId = null;
        } else {
          const hostMember = await interaction.guild?.members
            .fetch(pending.hostDiscordId)
            .catch(() => undefined);
          if (!hostMember) {
            results.push(
              `イベント(${eventId}) 主催者: ユーザー取得に失敗しました`,
            );
            continue;
          }
          const hostUser = await userManager.getOrCreateUser(hostMember);
          updateData.hostId = hostUser.id;
        }
      }

      if (pending.preparerDiscordId !== undefined) {
        if (pending.preparerDiscordId === null) {
          updateData.preparerId = null;
          updateData.prepareStatus = false;
        } else {
          const preparerMember = await interaction.guild?.members
            .fetch(pending.preparerDiscordId)
            .catch(() => undefined);
          if (!preparerMember) {
            results.push(
              `イベント(${eventId}) 準備者: ユーザー取得に失敗しました`,
            );
            continue;
          }
          const preparerUser =
            await userManager.getOrCreateUser(preparerMember);
          updateData.preparerId = preparerUser.id;
        }
      }

      if (Object.keys(updateData).length === 0) {
        delete editData.pendingChanges[eventId];
        continue;
      }

      const updatedEvent = await prisma.event.update({
        where: { id: event.id },
        data: updateData,
        ...eventIncludeHost,
      });

      if (scheduledEvent) {
        await eventManager.updateEventDescription(scheduledEvent, updatedEvent);
      }

      messageUpdateManager.enqueue(updatedEvent.id);
      logger.info(`イベント ${updatedEvent.id} の変更を確定`);

      results.push(
        `イベント(ID: ${updatedEvent.id}) の変更を確定しました。主催者: ${
          pending.hostDiscordId !== undefined
            ? pending.hostDiscordId
              ? `<@${pending.hostDiscordId}>`
              : 'なし'
            : '変更なし'
        } / 準備者: ${
          pending.preparerDiscordId !== undefined
            ? pending.preparerDiscordId
              ? `<@${pending.preparerDiscordId}>`
              : 'なし'
            : '変更なし'
        }`,
      );

      delete editData.pendingChanges[eventId];
    }

    await updateSchedules();

    const reply = await eventCreatorSetupCommand.createSetupPanel(interaction);
    if (reply) {
      const panelResult = await editData.interaction
        .editReply(reply)
        .catch(() => undefined);
      if (!panelResult) {
        await interaction.editReply(reply);
      }
    }

    await interaction.editReply({
      content: results.length
        ? results.join('\n')
        : '変更が反映されませんでした。対象イベントが見つかりませんでした。',
    });
  }
}

/**
 * SetupConfirmButtonActionのインスタンス
 */
export const setupConfirmButtonAction = new SetupConfirmButtonAction(
  'setupconfirm',
  ComponentType.Button,
);
