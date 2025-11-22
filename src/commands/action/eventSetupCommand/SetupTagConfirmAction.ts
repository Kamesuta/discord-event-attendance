import {
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { MessageComponentActionInteraction } from '@/commands/base/actionBase';
import { eventManager } from '@/domain/services/EventManager';
import { tagService } from '@/domain/services/TagService';
import {
  eventCreatorSetupCommand,
  TagEditState,
} from '@/commands/eventCreatorCommand/EventCreatorSetupCommand';
import { onCreateScheduledEvent } from '@/handlers/eventHandler';
import { messageUpdateManager } from '@/bot/client';
import { logger } from '@/utils/log';
import { prisma } from '@/utils/prisma';

class SetupTagConfirmAction extends MessageComponentActionInteraction<ComponentType.Button> {
  /**
   * ボタンを作成
   * @returns 作成したビルダー
   */
  override create(): ButtonBuilder {
    const customId = this.createCustomId();

    return new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('全てタグを確定')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Primary);
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ButtonInteraction,
    _params: URLSearchParams,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const editData =
      eventCreatorSetupCommand.setupPanels[
        eventCreatorSetupCommand.key(interaction)
      ];
    if (!editData?.tagEdits) {
      await interaction.editReply({
        content: 'パネルが賞味期限切れです。もう一度出してやり直してください',
      });
      return;
    }

    // イベント一覧を取得 (未キャッシュの場合は取得)
    if (!eventCreatorSetupCommand.scheduledEvents) {
      eventCreatorSetupCommand.scheduledEvents =
        await interaction.guild?.scheduledEvents.fetch();
    }

    const results: string[] = [];
    const failures: string[] = [];

    for (const [scheduledEventId, tagState] of Object.entries(
      editData.tagEdits,
    )) {
      const result = await this._saveTags(
        scheduledEventId,
        tagState,
        interaction,
      );
      if (result) {
        results.push(result);
      } else {
        failures.push(scheduledEventId);
      }
    }

    // パネルを更新
    const reply = await eventCreatorSetupCommand.createSetupPanel(
      editData.interaction,
    );
    if (reply) {
      await editData.interaction.editReply(reply);
    }

    const summaryLines = [
      results.length > 0
        ? `確定済み:\n${results.join('\n')}`
        : '確定するタグがありませんでした。',
      failures.length > 0 ? `確定に失敗: ${failures.join(', ')}` : undefined,
    ].filter(Boolean);

    await interaction.editReply({
      content: summaryLines.join('\n\n'),
    });
  }

  /**
   * タグを保存します
   * @param scheduledEventId DiscordイベントID
   * @param tagState タグ編集状態
   * @param interaction インタラクション
   * @returns 結果文字列
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

    // 確定済みタグとして状態を更新
    tagState.originalTags = pendingTags;
    tagState.pendingTags = pendingTags;

    // イベント説明と関連メッセージを更新
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
      savedTags.map((tag) => `#${tag.name}`).join(' ') || 'なし'
    }`;
  }
}

/**
 * SetupTagConfirmActionのインスタンス
 */
export const setupTagConfirmAction = new SetupTagConfirmAction(
  'setuptgall',
  ComponentType.Button,
);
