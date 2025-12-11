import {
  LabelBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { ModalActionInteraction } from '@/commands/base/actionBase';
import {
  eventCreatorSetupCommand,
  TagEditState,
} from '@/commands/eventCreatorCommand/EventCreatorSetupCommand';
import { tagService } from '@/domain/services/TagService';

/**
 * タグ編集モーダルのパラメータ
 */
interface TagEditModalParams {
  /**
   * スケジュールイベントID
   */
  eventId: string;
  /**
   * イベント名
   */
  eventName: string;
  /**
   * タグ編集状態
   */
  tagState: TagEditState;
}

class SetupTagEditModalAction extends ModalActionInteraction {
  /**
   * モーダルを作成
   * @param params モーダルパラメータ
   * @returns 作成したモーダル
   */
  override create(params: TagEditModalParams): ModalBuilder {
    const customId = this.createCustomId({
      evt: params.eventId,
    });

    const currentLine = tagService.formatTagLine(
      tagService.sanitizeTagNames(params.tagState.pendingTags),
    );
    const existingCandidates = tagService.formatTagLine(
      tagService.sanitizeTagNames(
        params.tagState.suggestions
          .filter((suggestion) => !suggestion.isNew)
          .map((suggestion) => suggestion.name),
      ),
    );
    const newCandidates = tagService.formatTagLine(
      tagService.sanitizeTagNames(
        params.tagState.suggestions
          .filter((suggestion) => suggestion.isNew)
          .map((suggestion) => suggestion.name),
      ),
    );
    const allTagsLine = tagService.formatTagLine(
      tagService.sanitizeTagNames(params.tagState.originalTags),
    );
    const presetLines = [
      `現在のタグ: ${currentLine || 'なし'}`,
      existingCandidates ? `既存候補: ${existingCandidates}` : undefined,
      newCandidates ? `新規候補: ${newCandidates}` : undefined,
      allTagsLine ? `全タグ: ${allTagsLine}` : undefined,
    ].filter(Boolean) as string[];
    const presetText = presetLines.join('\n');

    const tagInput = new TextInputBuilder()
      .setCustomId('tags')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder('#マイクラ #PvP #建築')
      .setValue(presetText);

    return new ModalBuilder()
      .setTitle(this._truncateLabel(`タグ編集:「${params.eventName}」`, 45))
      .setCustomId(customId)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          'スペース区切りでタグを入力（例: #マイクラ #建築）\nAI提案の既存候補/新規候補にも「#」をつけるとまとめて反映されます。',
        ),
      )
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('タグ編集')
          .setDescription(
            `#区切りでタグを入力。#がついていない単語は無視されます。`,
          )
          .setTextInputComponent(tagInput),
      );
  }

  /** @inheritdoc */
  async onCommand(
    interaction: ModalSubmitInteraction,
    params: URLSearchParams,
  ): Promise<void> {
    const eventId = params.get('evt');
    if (!eventId) return;

    await interaction.deferReply({ ephemeral: true });

    const editData =
      eventCreatorSetupCommand.setupPanels[
        eventCreatorSetupCommand.key(interaction)
      ];
    if (!editData) {
      await interaction.editReply({
        content: 'パネルが賞味期限切れです。もう一度出してやり直してください',
      });
      return;
    }

    const rawInput = interaction.fields.getTextInputValue('tags') ?? '';
    const sanitized = tagService.parseTagInput(rawInput);

    const tagState = editData.tagEdits?.[eventId];
    if (!tagState) {
      await interaction.editReply({
        content:
          'タグ情報が見つかりませんでした。もう一度セットアップパネルを開いてください。',
      });
      return;
    }
    tagState.pendingTags = sanitized;
    if (editData.tagEdits) {
      editData.tagEdits[eventId] = tagState;
    }

    // パネルを更新
    const reply = await eventCreatorSetupCommand.createSetupPanel(
      editData.interaction,
    );
    if (reply) {
      await editData.interaction.editReply(reply);
    }

    await interaction.editReply({
      content:
        sanitized.length > 0
          ? `タグを更新しました: ${sanitized.map((tag) => `#${tag}`).join(' ')}`
          : 'タグを更新しました（タグなし）',
    });
  }

  /**
   * ラベルの長さを適切に短縮します
   * @param label ラベル文字列
   * @param maxLength 最大文字数
   * @returns 短縮後の文字列
   */
  private _truncateLabel(label: string, maxLength: number): string {
    if (label.length <= maxLength) return label;
    return `${label.slice(0, maxLength - 1)}…`;
  }
}

/**
 * SetupTagEditModalActionのインスタンス
 */
export const setupTagEditModalAction = new SetupTagEditModalAction('setuptgm');
