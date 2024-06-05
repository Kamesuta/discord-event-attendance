import { ApplicationCommandDataResolvable, Interaction } from 'discord.js';

/**
 * コマンド/ボタン/コンテキストメニューなどの操作の基底クラス
 */
export abstract class InteractionBase {
  /**
   * ApplicationCommandManagerにコマンドを登録するための関数です
   * commandListにpush_backして登録することで、すべてのコマンドの登録後にまとめてDiscordにコマンドが登録されます
   * @param _commandList ApplicationCommandManagerに登録するコマンドのリスト
   */
  registerCommands(_commandList: ApplicationCommandDataResolvable[]): void {}

  /**
   * 他のInteractionBase(コマンドなど)に対してサブコマンドを登録するための関数です
   * すべてのサブコマンドの登録後、registerCommands()が呼ばれます
   */
  registerSubCommands(): void {}

  /**
   * InteractionCreateイベントが発生したときに呼ばれる関数です
   * 登録されているすべてのInteractionBaseに対して呼ばれます。
   * if文で必要な処理を行うか判断し、処理を行ってください。
   * @param _interaction InteractionCreateイベントが発生したときのInteraction
   */
  async onInteractionCreate(_interaction: Interaction): Promise<void> {}
}
