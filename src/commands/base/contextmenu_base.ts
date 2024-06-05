import {
  ApplicationCommandDataResolvable,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  Interaction,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
} from 'discord.js';
import { InteractionBase } from './interaction_base.js';

/**
 * ユーザーコンテキストメニュー
 */
export abstract class UserContextMenuInteraction extends InteractionBase {
  abstract command: ContextMenuCommandBuilder;

  /** @inheritdoc */
  registerCommands(commandList: ApplicationCommandDataResolvable[]): void {
    commandList.push(this.command.setType(ApplicationCommandType.User));
  }

  /** @inheritdoc */
  override async onInteractionCreate(interaction: Interaction): Promise<void> {
    // ユーザーを右クリックしたときのコンテキストメニュー
    if (
      interaction.isUserContextMenuCommand() &&
      this.command.type === ApplicationCommandType.User &&
      interaction.commandName === this.command.name
    ) {
      await this.onCommand(interaction);
    }
  }

  /**
   * コマンドが実行されたときに呼ばれる関数
   * @param interaction インタラクション
   */
  abstract onCommand(
    interaction: UserContextMenuCommandInteraction,
  ): Promise<void>;
}

/**
 * メッセージコンテキストメニュー
 */
export abstract class MessageContextMenuInteraction extends InteractionBase {
  abstract command: ContextMenuCommandBuilder;

  /** @inheritdoc */
  registerCommands(commandList: ApplicationCommandDataResolvable[]): void {
    commandList.push(this.command.setType(ApplicationCommandType.Message));
  }

  /** @inheritdoc */
  override async onInteractionCreate(interaction: Interaction): Promise<void> {
    // メッセージを右クリックしたときのコンテキストメニュー
    if (
      interaction.isMessageContextMenuCommand() &&
      this.command.type === ApplicationCommandType.Message &&
      interaction.commandName === this.command.name
    ) {
      await this.onCommand(interaction);
    }
  }

  /**
   * コマンドが実行されたときに呼ばれる関数
   * @param interaction インタラクション
   */
  abstract onCommand(
    interaction: MessageContextMenuCommandInteraction,
  ): Promise<void>;
}
