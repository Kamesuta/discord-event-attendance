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
    .addUserOption((option) =>
      option
        .setName('rank1')
        .setDescription('1位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank2')
        .setDescription('2位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank3')
        .setDescription('3位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank4')
        .setDescription('4位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank5')
        .setDescription('5位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank6')
        .setDescription('6位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank7')
        .setDescription('7位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank8')
        .setDescription('8位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank9')
        .setDescription('9位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank10')
        .setDescription('10位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank11')
        .setDescription('11位のユーザー')
        .setRequired(false),
    )
    .addUserOption((option) =>
      option
        .setName('rank12')
        .setDescription('12位のユーザー')
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
    )
    .addStringOption((option) =>
      option
        .setName('team')
        .setDescription(
          'チーム指定子 (2人チームの例:「2,4」) (参加賞の例:「=」) (3人に順位つけて、残りは参加賞の例:「3」)',
        )
        .setRequired(false),
    );

  /** 編集データ */
  private _editData: Record<string, EditData> = {};

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    // ゲームの勝敗を記録
    await interaction.deferReply({ ephemeral: false });

    // 編集データを初期化
    const key = new URLSearchParams({
      user: interaction.user.id,
      channel: interaction.channelId,
    }).toString();
    // 編集データを取得
    let editData: EditData | undefined = this._editData[key];

    // 15分(-30秒のバッファ)経ったデータは無視
    if (
      editData?.interaction.createdTimestamp <
      Date.now() - 14.5 * 60 * 1000
    ) {
      delete this._editData[key];
      editData = undefined;
    }
    // 編集データがない場合は新規作成
    if (!editData) {
      // イベントを取得
      const event = await eventManager.getEvent(interaction);
      if (!event) {
        await interaction.editReply({
          content: 'イベントが見つかりませんでした',
        });
        return;
      }

      // 参加者を列挙する
      const candidates = (
        await prisma.userStat.findMany({
          where: {
            eventId: event.id,
            show: true,
          },
        })
      ).map((stat) => stat.userId);

      // 編集データを作成
      this._editData[key] = editData = {
        interaction,
        candidates,
        game: {
          eventId: event.id,
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
    const editGame = editGameId
      ? await prisma.gameResult.findUnique({
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
        })
      : undefined;
    if (editGame) {
      // 不要なデータを消したうえで、編集データに追加
      editData.game = omit(editGame, 'users');
      editData.users = editGame.users.map((user) => omit(user, 'id'));
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
    const userAwards = this._calcAwards(interaction, editData.game.eventId);
    if (userAwards.length) {
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
   * @param eventId イベントID
   * @returns ユーザーごとの報酬
   */
  private _calcAwards(
    interaction: ChatInputCommandInteraction,
    eventId: number,
  ): Prisma.UserGameResultCreateManyGameInput[] {
    // ランクを取得
    const ranks = [...Array(12).keys()]
      .map((i) => interaction.options.getUser(`rank${i + 1}`))
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // チーム指定子 書式「2=優勝,4=準優勝,=参加(0.1)」
    const teamString = interaction.options.getString('team');
    // 指定されたチーム指定子
    const teamSpec: Omit<Award, 'userId'>[] | undefined = teamString
      ? teamString.split(',').flatMap((team) => {
          const [m, rank, group, xp] =
            /(\d*)(?:=([^(]*)(?:\((\d+)\))?)?/.exec(team) ?? [];
          if (!m) {
            return [];
          }
          return [
            {
              rank: rank ? parseInt(rank) : 0,
              xp: xp !== undefined ? parseInt(xp) : undefined,
              group: group ? group.trim() : undefined,
            },
          ];
        })
      : undefined;

    // ユーザーごとの獲得
    // ・チーム指定子なし → 個人戦
    // ・チーム指定子あり、デフォルトのみ → 全員参加賞
    // ・チーム指定子あり、チーム指定子が1つ → 個人戦 + 残りは参加賞
    // ・チーム指定子あり、チーム指定子が2つ以上 → チーム戦
    const userAwards: Award[] = [];
    if (teamSpec) {
      // デフォルトの賞
      const defaultAward = teamSpec.find((spec) => spec.rank === 0);
      // チーム指定子による賞の割り当て
      const specAwards = teamSpec
        .filter((spec) => spec.rank !== 0)
        .sort((a, b) => a.rank - b.rank);

      let currentIndex = 0;
      if (specAwards.length === 0) {
        // チーム指定子がない場合 → 全員参加賞
      } else if (specAwards.length === 1) {
        // チーム指定子が1つの場合 → 個人戦
        // デフォルトの賞
        ranks.slice(0, specAwards[0].rank).forEach((user, i) => {
          userAwards.push({
            userId: user.id,
            rank: i + 1,
            xp: xpMap[i],
          });
          currentIndex++;
        });
      } else {
        // チーム指定子が2つ以上の場合 → チーム戦
        // 1～n位までのユーザーに賞を割り当て
        specAwards.forEach((spec, rank) => {
          while (currentIndex < spec.rank && currentIndex < ranks.length) {
            userAwards.push({
              userId: ranks[currentIndex].id,
              rank: rank + 1,
              xp: spec.xp ?? xpMap[rank],
              group:
                spec.group ??
                (specAwards.length === 2
                  ? ['勝ち', '負け'][rank]
                  : `${rank + 1}位`), // 2チームの場合は「勝ち」「負け」
            });
            currentIndex++;
          }
        });
      }

      // 残りのユーザーにデフォルトの賞を割り当て
      while (currentIndex < ranks.length) {
        userAwards.push({
          userId: ranks[currentIndex].id,
          rank: 0,
          xp: defaultAward?.xp ?? 0.1,
          group: defaultAward?.group ?? '参加',
        });
        currentIndex++;
      }
    } else {
      // デフォルトの賞
      ranks.forEach((user, i) => {
        userAwards.push({
          userId: user.id,
          rank: i + 1,
          xp: xpMap[i],
        });
      });
    }

    return userAwards.map((award, _i) => ({
      ...award,
      eventId,
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
