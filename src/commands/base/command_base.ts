import {
  ApplicationCommandDataResolvable,
  ChatInputCommandInteraction,
  Interaction,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { InteractionBase } from './interaction_base.js';

/**
 * コマンドベースのインタラクション
 */
interface CommandBasedInteraction {
  /**
   * 自分のインタラクションかどうかを判定するための関数
   * @param interaction インタラクション
   * @returns 自分のインタラクションかどうか
   */
  isMyInteraction(interaction: ChatInputCommandInteraction): boolean;
}

/**
 * コマンドグループ
 */
export abstract class CommandGroupInteraction
  extends InteractionBase
  implements CommandBasedInteraction
{
  abstract command: SlashCommandSubcommandsOnlyBuilder;

  /** @inheritdoc */
  override registerCommands(
    commandList: ApplicationCommandDataResolvable[],
  ): void {
    commandList.push(this.command);
  }

  /** @inheritdoc */
  isMyInteraction(interaction: ChatInputCommandInteraction): boolean {
    return interaction.commandName === this.command.name;
  }
}

/**
 * サブコマンドグループ
 */
export abstract class SubcommandGroupInteraction
  extends InteractionBase
  implements CommandBasedInteraction
{
  abstract command: SlashCommandSubcommandGroupBuilder;

  /**
   * コンストラクタ
   * @param _registry サブコマンドグループを登録する先
   */
  constructor(private _registry: CommandGroupInteraction) {
    super();
  }

  /** @inheritdoc */
  override registerSubCommands(): void {
    this._registry.command.addSubcommandGroup(this.command);
  }

  /** @inheritdoc */
  isMyInteraction(interaction: ChatInputCommandInteraction): boolean {
    return (
      interaction.options.getSubcommandGroup() === this.command.name &&
      this._registry.isMyInteraction(interaction)
    );
  }
}

/**
 * コマンド
 */
export abstract class CommandInteraction
  extends InteractionBase
  implements CommandBasedInteraction
{
  abstract command: SlashCommandBuilder;

  /** @inheritdoc */
  override registerCommands(
    commandList: ApplicationCommandDataResolvable[],
  ): void {
    commandList.push(this.command);
  }

  /** @inheritdoc */
  isMyInteraction(interaction: ChatInputCommandInteraction): boolean {
    return interaction.commandName === this.command.name;
  }

  /** @inheritdoc */
  override async onInteractionCreate(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    if (!this.isMyInteraction(interaction)) return;
    await this.onCommand(interaction);
  }

  /**
   * コマンドが実行されたときに呼ばれる関数
   * @param interaction インタラクション
   */
  abstract onCommand(interaction: ChatInputCommandInteraction): Promise<void>;
}

/**
 * サブコマンド
 */
export abstract class SubcommandInteraction
  extends InteractionBase
  implements CommandBasedInteraction
{
  abstract command: SlashCommandSubcommandBuilder;

  /**
   * コンストラクタ
   * @param _registry サブコマンドグループを登録する先
   */
  constructor(
    private _registry: CommandGroupInteraction | SubcommandGroupInteraction,
  ) {
    super();
  }

  /** @inheritdoc */
  override registerSubCommands(): void {
    this._registry.command.addSubcommand(this.command);
  }

  /** @inheritdoc */
  isMyInteraction(interaction: ChatInputCommandInteraction): boolean {
    return (
      interaction.options.getSubcommand() === this.command.name &&
      this._registry.isMyInteraction(interaction)
    );
  }

  /** @inheritdoc */
  override async onInteractionCreate(interaction: Interaction): Promise<void> {
    if (!interaction.isChatInputCommand()) return;
    if (!this.isMyInteraction(interaction)) return;
    await this.onCommand(interaction);
  }

  /**
   * コマンドが実行されたときに呼ばれる関数
   * @param interaction インタラクション
   */
  abstract onCommand(interaction: ChatInputCommandInteraction): Promise<void>;
}
