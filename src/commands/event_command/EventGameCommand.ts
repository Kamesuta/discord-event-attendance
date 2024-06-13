import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import {
  ALPHABET,
  Award,
  GameResultData,
  makeEmbed,
  xpMap,
} from '../../event/game.js';
import eventManager from '../../event/EventManager.js';
import { prisma } from '../../index.js';
import splitStrings from '../../event/splitStrings.js';
import { GameResult, Prisma } from '@prisma/client';
import omit from 'lodash/omit';

/**
 * 編集データ
 */
interface EditData {
  /** インタラクション */
  interaction: ChatInputCommandInteraction;
  /** 参加者のリスト */
  candidates: string[];
  /** ゲーム */
  game: Partial<GameResult> & Omit<GameResult, 'id'>;
  /** ユーザー */
  users: Prisma.UserGameResultCreateManyGameInput[];
  /** ユーザーを更新するか */
  updateUsers: boolean;
}

class EventGameCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('game')
    .setDescription('ゲームの勝敗を記録します')
    .addStringOption((option) =>
      option.setName('game_name').setDescription('ゲーム名').setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('rank')
        .setDescription(
          'チーム指定子 (2人チームの例:「AB,CD」) (参加賞の例:「,,ABC」) (3人に順位つけて、残りは参加賞の例:「ABC,,DEF」)',
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
    if (!editData) {
      // 編集データを作成
      this._editData[key] = editData = {
        interaction,
        candidates: [],
        game: {
          eventId: 0,
          name: '試合',
          url: null,
          image: null,
        },
        users: [],
        updateUsers: false,
      };
    }

    // 編集する試合IDを取得
    const editGameId = interaction.options.getInteger('game_id');
    // 編集中の試合ID/イベントIDが異なる場合は初期化
    if (editData.game.eventId !== event.id || editData.game.id !== editGameId) {
      // インタラクションをリセット
      editData.interaction = interaction;

      // イベントIDが異なる場合は初期化
      if (editData.game.eventId !== event.id) {
        // イベントIDを更新
        editData.game.eventId = event.id;

        // 参加者を列挙する
        editData.candidates = (
          await prisma.userStat.findMany({
            where: {
              eventId: event.id,
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
          await interaction.editReply({
            content: '試合が見つかりませんでした',
          });
          return;
        }
        if (editGame.eventId !== editData.game.eventId) {
          await interaction.editReply({
            content: '現在編集中のイベントの試合のみ編集できます',
          });
          return;
        }

        // 不要なデータを消したうえで、編集データに追加
        editData.game = omit(editGame, 'users');
        editData.users = editGame.users.map((user) => omit(user, 'id'));
      } else {
        // ID指定がない場合はリンク解除
        editData.game.id = undefined;
      }
    }

    // Embedを作成
    const embeds = new EmbedBuilder()
      .setTitle('ゲームの勝敗を記録')
      .setDescription('参加者を選択してください');

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

    // ゲームの名前を取得
    const gameName = interaction.options.getString('game_name');
    if (gameName) editData.game.name = gameName;
    // URLを取得
    const url = interaction.options.getString('url') ?? undefined;
    if (url) editData.game.url = url;
    // 添付画像を取得
    const deleteImage = interaction.options.getBoolean('delete_image') ?? false;
    if (deleteImage) {
      editData.game.image = null;
    } else {
      const image = interaction.options.getAttachment('image')?.proxyURL;
      if (image) editData.game.image = image;
    }
    // ユーザーの報酬
    const userAwards = this._calcAwards(interaction, editData);
    if (userAwards) {
      editData.users = userAwards;
      editData.updateUsers = true;
    }

    // 表示用のプレビューを作成
    const game = this._previewGetGameResult(editData);
    // 結果を表示
    makeEmbed(embeds, game);

    if (interaction === editData.interaction) {
      // 新規の場合、そのまま返信
      await interaction.editReply({
        embeds: [embeds],
      });
    } else {
      // 2回目以降の場合、元のメッセージを編集し、リプライを削除
      await editData.interaction.editReply({
        embeds: [embeds],
      });
      await interaction.deleteReply();
    }
  }

  /**
   * ユーザーの報酬を計算
   * @param interaction インタラクション
   * @param editData 編集データ
   * @returns ユーザーごとの報酬
   */
  private _calcAwards(
    interaction: ChatInputCommandInteraction,
    editData: EditData,
  ): Prisma.UserGameResultCreateManyGameInput[] | undefined {
    // チーム指定子 書式「ABC=優勝,DEF=準優勝,,=参加(0.1)」
    const teamString = interaction.options.getString('rank');
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
   * @param editData 編集データ
   * @returns 記録した試合の結果
   */
  private async _addGameResult(editData: EditData): Promise<GameResultData> {
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

    // 試合の結果を記録
    const game = editData.game.id // IDがある = 編集モードの場合
      ? await prisma.gameResult.update({
          where: {
            id: editData.game.id,
          },
          data: {
            ...omit(editData.game, 'id', 'eventId'),
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
