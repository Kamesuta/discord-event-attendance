import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import {
  eventCreatorSetupCommand,
  TagEditState,
} from '@/commands/eventCreatorCommand/EventCreatorSetupCommand';
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
import { tagService } from '@/domain/services/TagService';

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const editKey = eventCreatorSetupCommand.key(interaction);
    const editData = eventCreatorSetupCommand.setupPanels[editKey];
    if (!editData) {
      await interaction.editReply({
        content: 'パネルが賞味期限切れです。もう一度出してやり直してください',
      });
      return;
    }

    const pendingEntries = Object.entries(editData.pendingChanges ?? {});
    const pendingTagEntries = Object.entries(editData.tagEdits ?? {}).filter(
      ([, tagState]) => eventCreatorSetupCommand.hasUnsavedTags(tagState),
    );
    if (pendingEntries.length === 0 && pendingTagEntries.length === 0) {
      await interaction.editReply({ content: '確定する変更がありません。' });
      return;
    }

    const memberResults: string[] = [];
    const tagResults: string[] = [];
    const tagFailures: string[] = [];

    for (const [eventId, pending] of pendingEntries) {
      const scheduledEvent =
        eventCreatorSetupCommand.scheduledEvents?.get(eventId) ??
        (await interaction.guild?.scheduledEvents
          .fetch(eventId)
          .catch(() => undefined));

      let event = await eventManager.getEventFromDiscordId(eventId);
      if (!event) {
        if (!scheduledEvent) {
          memberResults.push(
            `ID: ${eventId} のDiscordイベントが見つかりませんでした`,
          );
          continue;
        }
        event = (await onCreateScheduledEvent(scheduledEvent)) ?? null;
        if (!event) {
          memberResults.push(`イベント(${eventId})の作成に失敗しました`);
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
            memberResults.push(
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
            memberResults.push(
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

      memberResults.push(
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

    for (const [scheduledEventId, tagState] of pendingTagEntries) {
      const result = await this._saveTags(
        scheduledEventId,
        tagState,
        interaction,
      );
      if (result) {
        tagResults.push(result);
      } else {
        tagFailures.push(scheduledEventId);
      }
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

    const summaryLines = [
      memberResults.length
        ? `メンバー変更:\n${memberResults.join('\n')}`
        : undefined,
      tagResults.length ? `タグ更新:\n${tagResults.join('\n')}` : undefined,
      tagFailures.length
        ? `タグ更新に失敗: ${tagFailures.join(', ')}`
        : undefined,
    ].filter(Boolean) as string[];

    await interaction.editReply({
      content: summaryLines.length
        ? summaryLines.join('\n\n')
        : '変更が反映されませんでした。対象イベントが見つかりませんでした。',
    });
  }

  /**
   * タグを保存します
   * @param scheduledEventId DiscordイベントID
   * @param tagState タグ編集状態
   * @param interaction インタラクション
   * @returns 保存結果
   */
  private async _saveTags(
    scheduledEventId: string,
    tagState: TagEditState,
    interaction: ButtonInteraction,
  ): Promise<string | undefined> {
    const scheduledEvent =
      eventCreatorSetupCommand.scheduledEvents?.get(scheduledEventId) ??
      (await interaction.guild?.scheduledEvents
        .fetch(scheduledEventId)
        .catch(() => undefined));
    if (!scheduledEvent) {
      logger.warn(`Discordイベントが見つかりませんでした: ${scheduledEventId}`);
      return;
    }

    const existingEvent =
      await eventManager.getEventFromDiscordId(scheduledEventId);
    const event =
      existingEvent ?? (await onCreateScheduledEvent(scheduledEvent));
    if (!event) {
      logger.warn(`イベントが作成できませんでした: ${scheduledEventId}`);
      return;
    }

    const pendingTags = tagService.sanitizeTagNames(tagState.pendingTags);
    const savedTags = await tagService.setEventTags(event.id, pendingTags);

    tagState.originalTags = pendingTags;
    tagState.pendingTags = pendingTags;

    const updatedEvent = await eventManager.getEventFromId(event.id);
    if (updatedEvent) {
      const newDescription = eventManager.formatEventDescription(
        scheduledEvent.description ?? updatedEvent.description,
        updatedEvent,
      );
      await prisma.event.update({
        where: { id: updatedEvent.id },
        data: { description: newDescription },
      });
      await eventManager.updateEventDescription(scheduledEvent, updatedEvent);
      messageUpdateManager.enqueue(updatedEvent.id);
    }

    return `${scheduledEvent.name}: ${
      tagService.formatTagLine(savedTags.map((tag) => tag.name)) || 'なし'
    }`;
  }
}

/**
 * SetupConfirmButtonActionのインスタンス
 */
export const setupConfirmButtonAction = new SetupConfirmButtonAction(
  'setupconfirm',
  ComponentType.Button,
);
