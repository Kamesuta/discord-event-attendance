import {
  ActionRowBuilder,
  ButtonBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionEditReplyOptions,
  RepliableInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import {
  ALPHABET,
  Award,
  GameResultData,
  getGameResultNumbering,
  makeEmbed,
  xpMap,
} from '../../event/game.js';
import eventManager from '../../event/EventManager.js';
import { prisma } from '../../index.js';
import splitStrings from '../../event/splitStrings.js';
import { Event, GameResult, Prisma } from '@prisma/client';
import omit from 'lodash/omit';
import gameEditButtonAction from '../action/event_game_command/GameEditButtonAction.js';
import gameClearButtonAction from '../action/event_game_command/GameClearButtonAction.js';
import gameDeleteButtonAction from '../action/event_game_command/GameDeleteButtonAction.js';
import gameConfirmButtonAction from '../action/event_game_command/GameConfirmButtonAction.js';

/**
 * 編集データ
 */
export interface EditData {
  /** キー */
  key: string;
  /** インタラクション */
  interaction: RepliableInteraction;
  /** 参加者のリスト */
  candidates: string[];
  /** ランク指定子 */
  rank: string;
  /** ゲーム */
  game: Partial<GameResult> & Omit<GameResult, 'id'>;
  /** ユーザー */
  users: Prisma.UserGameResultCreateManyGameInput[];
  /** ユーザーを更新するか */
  updateUsers: boolean;
  /** 何番目の試合か */
  gameNumber: number;
}

class EventGameCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('game')
    .setDescription('ゲームの勝敗を記録します')
    .addStringOption((option) =>
      option
        .setName('game_name')
        .setDescription(
          'ゲーム名 (「＄」がイベント名、「＠」が何番目の試合かに変換されます)',
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('rank')
        .setDescription(
          'ランク指定子 (2人チームの例:「AB,CD」) (参加賞の例:「,,ABC」) (3人に順位つけて、残りは参加賞の例:「ABC,,DEF」)',
        )
        .setRequired(false),
    )
    .addStringOption((option) =>
      option.setName('url').setDescription('試合のURL').setRequired(false),
    )
    .addAttachmentOption((option) =>
      option.setName('image').setDescription('試合の画像').setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('delete_image')
        .setDescription('試合の画像を削除するか')
        .setRequired(false),
    )
    .addIntegerOption((option) =>
      option
        .setName('game_id')
        .setDescription('編集する試合ID')
        .setRequired(false),
    );

  /** 編集データ */
  private _editData: Record<string, EditData> = {};

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // ゲームの勝敗を記録
    await interaction.deferReply({ ephemeral: true });

    // イベントを取得
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    // 編集データを初期化
    const key = new URLSearchParams({
      user: interaction.user.id,
      channel: interaction.channelId,
    }).toString();

    // 編集する試合IDを取得
    const editGameId = interaction.options.getInteger('game_id');
    // 編集データを取得
    const editData = await this.getEditData(
      key,
      interaction,
      event.id,
      editGameId ?? undefined,
    ).catch(async (content: string) => {
      await interaction.editReply({ content });
    });
    if (!editData) return;

    // ゲーム編集状態を設定
    this.setEditData(editData, {
      gameName: interaction.options.getString('game_name'),
      url: interaction.options.getString('url'),
      deleteImage: interaction.options.getBoolean('delete_image'),
      image: interaction.options.getAttachment('image')?.proxyURL,
      rank: interaction.options.getString('rank'),
    });

    // Embedを更新
    await this.updateEmbed(event, editData, interaction);
  }

  /**
   * 編集データを設定
   * @param editData 編集データ
   * @param options 編集データ
   */
  setEditData(
    editData: EditData,
    options: {
      /** ゲーム名 */
      gameName?: string | null;
      /** URL */
      url?: string | null;
      /** 画像を削除するか */
      deleteImage?: boolean | null;
      /** 画像 */
      image?: string | null;
      /** チーム指定子 */
      rank?: string | null;
    },
  ): void {
    // ゲームの名前を取得
    if (options.gameName) editData.game.name = options.gameName;
    // URLを取得
    if (options.url) editData.game.url = options.url;
    // 添付画像を取得
    if (options.deleteImage) {
      editData.game.image = null;
    } else if (options.image) {
      editData.game.image = options.image;
    }
    // チーム指定子 書式「ABC=優勝,DEF=準優勝,,=参加(0.1)」
    if (options.rank) {
      // ユーザーの報酬
      const userAwards = this.calcAwards(editData, options.rank);
      if (userAwards) {
        editData.rank = options.rank;
        editData.users = userAwards;
        editData.updateUsers = true;
      }
    }
  }

  /**
   * Embedを更新
   * @param event イベント
   * @param editData 編集データ
   * @param interaction 返信用のインタラクション
   */
  async updateEmbed(
    event: Event,
    editData: EditData,
    interaction?: RepliableInteraction,
  ): Promise<void> {
    const embeds = this.makeEditEmbed(event, editData);

    // メッセージを作成
    const message: InteractionEditReplyOptions = {
      embeds: [embeds],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          gameEditButtonAction.create(editData),
          gameClearButtonAction.create(editData),
          gameDeleteButtonAction.create(editData),
          gameConfirmButtonAction.create(editData),
        ),
      ],
    };

    if (!interaction) {
      // インタラクションが指定されていない場合、元のメッセージを編集
      await editData.interaction.editReply(message);
    } else if (interaction === editData.interaction) {
      // 新規の場合、そのまま返信
      await interaction.editReply(message);
    } else {
      // 2回目以降の場合、元のメッセージを編集し、リプライを削除
      await editData.interaction.editReply(message);
      await interaction.deleteReply();
    }
  }

  /**
   * 編集用のEmbedを作成
   * @param event イベント
   * @param editData 編集データ
   * @returns Embed
   */
  makeEditEmbed(event: Event, editData: EditData): EmbedBuilder {
    const embeds = new EmbedBuilder()
      .setTitle('ゲームの勝敗を記録')
      .setDescription(
        '引数つきで`/event game`を叩く、もしくはボタンを押して編集できます。\n編集が済んだら「登録」ボタンを押してください。',
      );

    // イベント名を表示
    embeds.addFields({
      name: 'イベント名',
      value: `${event.name}`,
    });

    // 試合名を表示
    const gameName = editData.game.name
      .replace(/＄/g, event.name)
      .replace(/＠/g, `${editData.gameNumber}`);
    embeds.addFields({
      name: '試合名',
      value: `\`${editData.game.name}\`\n${gameName}`,
    });

    // チーム指定子を表示
    if (editData.rank) {
      embeds.addFields({
        name: 'チーム指定子',
        value: `\`${editData.rank}\``, // コードブロックで表示
      });
    }

    // 候補のユーザーを列挙する
    splitStrings(
      editData.candidates.map((userId, index) => {
        // [${A-Za-z0-9の連番}] <@${ユーザーID}>
        const countText = index < ALPHABET.length ? `${ALPHABET[index]}` : '?';
        return `[${countText}] <@${userId}>`;
      }),
      1024,
    ).forEach((line, i) => {
      embeds.addFields({
        name: i === 0 ? '参加者リスト' : '\u200b',
        value: line,
      });
    });

    // 表示用のプレビューを作成
    const game = this._previewGetGameResult(editData);
    // 結果を表示
    makeEmbed(embeds, game);
    return embeds;
  }

  /**
   * 編集データを取得
   * @param key キー
   * @param interaction 返信用のインタラクション
   * @param eventId イベントID
   * @param editGameId 編集する試合ID
   * @param clear 編集データをクリアするか
   * @returns 編集データ
   * @throws エラーメッセージ
   */
  async getEditData(
    key: string,
    interaction: RepliableInteraction,
    eventId: number,
    editGameId?: number,
    clear = false,
  ): Promise<EditData> {
    // 編集データを取得
    let editData: EditData | undefined = this._editData[key];

    // 15分(-30秒のバッファ)経ったデータのインタラクションは更新
    if (
      editData?.interaction.createdTimestamp <
      Date.now() - 14.5 * 60 * 1000
    ) {
      this._editData[key].interaction = interaction;
    }
    // 編集データがない場合は新規作成
    if (!editData || clear) {
      // 編集データを作成
      this._editData[key] = editData = {
        key,
        interaction,
        candidates: [],
        rank: '',
        game: {
          eventId: 0,
          name: '＄ ＠戦目',
          url: null,
          image: null,
        },
        users: [],
        updateUsers: false,
        gameNumber: 0,
      };
    }

    // 編集中の試合ID/イベントIDが異なる場合は初期化
    if (
      editData.game.eventId !== eventId ||
      (editGameId !== undefined && editData.game.id !== editGameId)
    ) {
      // インタラクションをリセット
      editData.interaction = interaction;

      // イベントIDが異なる場合は初期化
      if (editData.game.eventId !== eventId) {
        // イベントIDを更新
        editData.game.eventId = eventId;

        // 参加者を列挙する
        editData.candidates = (
          await prisma.userStat.findMany({
            where: {
              eventId,
              show: true,
            },
          })
        ).map((stat) => stat.userId);
      }

      // 編集中かつ、イベントIDと異なったらエラー
      if (editGameId) {
        // IDがある = 編集モードの場合は読み込み
        const editGame = await prisma.gameResult.findUnique({
          where: {
            id: editGameId,
          },
          include: {
            users: {
              orderBy: {
                rank: 'asc',
              },
            },
          },
        });
        if (!editGame) {
          throw '試合が見つかりませんでした';
        }
        if (editGame.eventId !== editData.game.eventId) {
          throw `現在編集中のイベントの試合のみ編集できます\n(選択しようとしたイベントID: ${editGame.eventId}、現在編集中のイベントID: ${editData.game.eventId})`;
        }

        // 不要なデータを消したうえで、編集データに追加
        editData.game = omit(editGame, 'users');
        editData.users = editGame.users.map((user) => omit(user, 'id'));
      } else {
        // ID指定がない場合はリンク解除
        editData.game.id = undefined;
      }

      // 何番目の試合か
      editData.gameNumber = await getGameResultNumbering(
        eventId,
        editData.game.id,
      );
    }

    return editData;
  }

  /**
   * ユーザーの報酬を計算
   * @param editData 編集データ
   * @param teamString チーム指定子
   * @returns ユーザーごとの報酬
   */
  calcAwards(
    editData: EditData,
    teamString: string | null,
  ): Prisma.UserGameResultCreateManyGameInput[] | undefined {
    if (!teamString) {
      return;
    }

    // 指定されたチーム指定子
    let defaultSpecMode = false;
    const teamSpec: (Omit<Award, 'userId'> & { users: string[] })[] = [];
    teamString.split(',').forEach((team, rank) => {
      if (team.length === 0) {
        defaultSpecMode = true;
        return;
      }

      const [m, userSpec, group, xp] =
        /([A-Za-z0-9]+)(?:=([^(]*)(?:\((\d+)\))?)?/.exec(team) ?? [];
      if (!m) {
        return;
      }

      // ユーザー取得
      const indices = userSpec.split('').map((c) => ALPHABET.indexOf(c));
      const users = indices
        .map((index) => editData.candidates[index])
        .filter((id) => id);

      teamSpec.push({
        users,
        rank: defaultSpecMode ? 0 : rank + 1,
        xp: xp !== undefined ? parseInt(xp) : undefined,
        group: group ? group.trim() : undefined,
      });
    });

    // ユーザーごとの獲得
    // ・チーム指定子なし → 個人戦
    // ・チーム指定子あり、デフォルトのみ → 全員参加賞
    // ・チーム指定子あり、チーム指定子が1つ → 個人戦 + 残りは参加賞
    // ・チーム指定子あり、チーム指定子が2つ以上 → チーム戦
    const userAwards: Award[] = [];
    // デフォルトの賞
    const defaultAward = teamSpec.find((spec) => spec.rank === 0);
    // チーム指定子による賞の割り当て
    const specAwards = teamSpec
      .filter((spec) => spec.rank !== 0)
      .sort((a, b) => a.rank - b.rank);

    if (specAwards.length === 0) {
      // チーム指定子がない場合 → 全員参加賞
    } else if (specAwards.length === 1) {
      // チーム指定子が1つの場合 → 個人戦
      const specAward = specAwards[0];
      // 順番にランクを割り当て
      specAward.users.forEach((userId, rank) => {
        userAwards.push({
          ...omit(specAward, 'users'),
          userId,
          rank: rank + 1,
          xp: xpMap[rank],
        });
      });
    } else {
      // チーム指定子が2つ以上の場合 → チーム戦
      // 1～n位までのユーザーに賞を割り当て
      specAwards.forEach((spec) => {
        spec.users.forEach((userId) => {
          userAwards.push({
            userId,
            rank: spec.rank,
            xp: spec.xp ?? xpMap[spec.rank],
            group:
              spec.group ??
              (specAwards.length === 2
                ? ['勝ち', '負け'][spec.rank - 1]
                : `${spec.rank}位`), // 2チームの場合は「勝ち」「負け」
          });
        });
      });
    }

    // 残りのユーザーにデフォルトの賞を割り当て
    defaultAward?.users.forEach((userId) => {
      userAwards.push({
        userId,
        rank: 0,
        xp: defaultAward?.xp ?? 0.1,
        group: defaultAward?.group ?? '参加',
      });
    });

    return userAwards.map((award, _i) => ({
      ...award,
      eventId: editData.game.eventId,
      xp: award.xp ?? 0,
    }));
  }

  /**
   * ゲームの勝敗を記録する
   * @param event イベント
   * @param editData 編集データ
   * @returns 記録した試合の結果
   */
  async addGameResult(
    event: Event,
    editData: EditData,
  ): Promise<GameResultData> {
    // DB編集クエリ
    const users = !editData.updateUsers // 参加者の変更があった場合
      ? undefined
      : {
          // IDがある = 編集モードの場合はユーザーは全削除
          deleteMany: editData.game.id ? {} : undefined,
          createMany: {
            data: editData.users,
          },
        };

    // 試合名を取得
    const gameName = editData.game.name
      .replace(/＄/g, event.name)
      .replace(/＠/g, `${editData.gameNumber}`);

    // 試合の結果を記録
    const game = editData.game.id // IDがある = 編集モードの場合
      ? await prisma.gameResult.update({
          where: {
            id: editData.game.id,
          },
          data: {
            ...omit(editData.game, 'id', 'eventId'),
            name: gameName,
            users,
          },
          include: {
            users: {
              orderBy: {
                rank: 'asc',
              },
            },
          },
        })
      : await prisma.gameResult.create({
          data: {
            ...omit(editData.game, 'id'),
            name: gameName,
            users,
          },
          include: {
            users: {
              orderBy: {
                rank: 'asc',
              },
            },
          },
        });

    return game;
  }

  /**
   * ゲームの勝敗を削除する
   * @param id 試合ID
   */
  async deleteGameResult(id: number): Promise<void> {
    await prisma.gameResult.delete({
      where: {
        id,
      },
    });
  }

  /**
   * ゲームの勝敗を取得する
   * @param editData 編集データ
   * @returns 仮に記録した場合の試合の結果
   */
  private _previewGetGameResult(editData: EditData): GameResultData {
    // すでに登録されているデータを取得
    return {
      ...editData.game,
      id: editData.game.id ?? 0,
      users: editData.users.map((user, i) => ({
        ...user,
        id: i,
        gameId: editData.game.id ?? 0,
        group: user.group ?? null,
      })),
    };
  }
}

export default new EventGameCommand(eventCommand);
