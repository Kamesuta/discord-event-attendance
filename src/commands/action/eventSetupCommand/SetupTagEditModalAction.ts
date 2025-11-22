import {
  ActionRowBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
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

    const suggestionLabel = this._buildSuggestionLabel(params.tagState);
    const tagInput = new TextInputBuilder()
      .setCustomId('tags')
      .setLabel(suggestionLabel)
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder('スペース区切りでタグを入力 (例: PvP 建築 交流会)')
      .setValue(params.tagState.pendingTags.join(' '));

    return new ModalBuilder()
      .setTitle(this._truncateLabel(`タグ編集: ${params.eventName}`, 45))
      .setCustomId(customId)
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(tagInput),
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

    const tagInput =
      interaction.fields.getTextInputValue('tags')?.split(/\s+/) ?? [];
    const sanitized = tagService.sanitizeTagNames(tagInput);

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
   * ラベルを作成します
   * @param tagState タグ編集状態
   * @returns ラベル文字列
   */
  private _buildSuggestionLabel(tagState: TagEditState): string {
    const defaultSelected = tagState.suggestions
      .filter((suggestion) => suggestion.preselect)
      .slice(0, 3)
      .map((suggestion) => suggestion.name);
    const existing = tagState.suggestions
      .filter((suggestion) => !suggestion.preselect && !suggestion.isNew)
      .slice(0, 3)
      .map((suggestion) => suggestion.name);
    const newCandidates = tagState.suggestions
      .filter((suggestion) => !suggestion.preselect && suggestion.isNew)
      .slice(0, 2)
      .map((suggestion) => suggestion.name);

    const parts = [
      defaultSelected.length > 0
        ? `候補(選択済): ${defaultSelected.join(' / ')}`
        : undefined,
      existing.length > 0 ? `既存: ${existing.join(' / ')}` : undefined,
      newCandidates.length > 0
        ? `新規: ${newCandidates.join(' / ')}`
        : undefined,
    ].filter(Boolean) as string[];
    const label = parts.join(' | ') || 'スペース区切りでタグを入力';
    return this._truncateLabel(label, 45);
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
