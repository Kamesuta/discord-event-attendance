import {
  Interaction,
  MappedComponentTypes,
  MappedInteractionTypes,
  ModalBuilder,
  ModalSubmitInteraction,
} from 'discord.js';
import { InteractionBase } from './interaction_base.js';

/**
 * アクション
 */
abstract class ActionInteraction<
  MenuInteraction extends Interaction & { customId: string },
> extends InteractionBase {
  /**
   * コンストラクタ
   * @param _id アクションを識別するためのID
   */
  constructor(private _id: string) {
    super();
  }

  /**
   * カスタムIDを生成
   * @param data カスタムIDに含めるデータ
   * @returns カスタムID
   */
  protected createCustomId(data?: Record<string, string>): string {
    const params = new URLSearchParams({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      _: this._id,
      ...data,
    });
    return params.toString();
  }

  /**
   * カスタムIDが自分のものか確認
   * @param params カスタムIDのパラメータ
   * @returns 自分のものかどうか
   */
  protected isMyCustomId(params: URLSearchParams): boolean {
    if (params.get('_') !== this._id) return false;
    return true;
  }

  /**
   * インタラクションの型が一致するか確認
   * @param interaction インタラクション
   * @returns 一致するかどうか
   */
  protected abstract isType(
    interaction: Interaction,
  ): interaction is MenuInteraction;

  /** @inheritdoc */
  override async onInteractionCreate(interaction: Interaction): Promise<void> {
    // 型が一致しない場合は無視
    if (!this.isType(interaction)) return;

    // カスタムIDをパースし、自分のアクションか確認
    const params = new URLSearchParams(interaction.customId);
    if (!this.isMyCustomId(params)) return;

    await this.onCommand(interaction, params);
  }

  /**
   * コマンドが実行されたときに呼ばれる関数
   * @param interaction インタラクション
   * @param params カスタムIDのパラメータ
   */
  abstract onCommand(
    interaction: MenuInteraction,
    params: URLSearchParams,
  ): Promise<void>;
}

/**
 * メッセージコンポーネントのアクション
 */
export abstract class MessageComponentActionInteraction<
  MenuComponentType extends keyof MappedInteractionTypes,
> extends ActionInteraction<MappedInteractionTypes[MenuComponentType]> {
  /**
   * コンストラクタ
   * @param id アクションを識別するためのID
   * @param _type コンポーネントの種類
   */
  constructor(
    id: string,
    private _type: MenuComponentType,
  ) {
    super(id);
  }

  /**
   * ビルダーの作成を行う
   * @returns 作成したビルダー
   */
  abstract create(...args: unknown[]): MappedComponentTypes[MenuComponentType];

  /** @inheritdoc */
  protected override createCustomId(data?: Record<string, string>): string {
    return super.createCustomId({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      _t: `${this._type}`,
      ...data,
    });
  }

  /** @inheritdoc */
  protected override isMyCustomId(params: URLSearchParams): boolean {
    if (!super.isMyCustomId(params)) return false;
    if (params.get('_t') !== `${this._type}`) return false;
    return true;
  }

  /** @inheritdoc */
  protected override isType(
    interaction: Interaction,
  ): interaction is MappedInteractionTypes[MenuComponentType] {
    return (
      interaction.isMessageComponent() &&
      interaction.componentType === this._type
    );
  }
}

/**
 * モーダルダイアログのアクション
 */
export abstract class ModalActionInteraction extends ActionInteraction<ModalSubmitInteraction> {
  /**
   * コンストラクタ
   * @param id アクションを識別するためのID
   */
  constructor(id: string) {
    super(id);
  }

  /**
   * ビルダーの作成を行う
   * @returns 作成したビルダー
   */
  abstract create(...args: unknown[]): ModalBuilder;

  /** @inheritdoc */
  protected override createCustomId(data?: Record<string, string>): string {
    return super.createCustomId({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      _t: 'm',
      ...data,
    });
  }

  /** @inheritdoc */
  protected override isMyCustomId(params: URLSearchParams): boolean {
    if (!super.isMyCustomId(params)) return false;
    if (params.get('_t') !== 'm') return false;
    return true;
  }

  /** @inheritdoc */
  protected override isType(
    interaction: Interaction,
  ): interaction is ModalSubmitInteraction {
    return interaction.isModalSubmit();
  }
}
