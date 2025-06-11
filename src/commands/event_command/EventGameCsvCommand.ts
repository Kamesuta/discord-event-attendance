import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { SubcommandInteraction } from '../base/command_base.js';
import eventCommand from './EventCommand.js';
import eventManager from '../../event/EventManager.js';
import { parse } from 'csv-parse';
import { Event, User } from '@prisma/client';
import eventGameCommand, { AddGameData } from './EventGameCommand.js';
import { getGameResultNumbering, makeEmbed, xpMap } from '../../event/game.js';
import { logger } from '../../utils/log.js';
import userManager from '../../event/UserManager.js';

// 参加者の型定義
interface Participant {
  name: string;
  id: string;
}

// ランキング
interface Ranking {
  participant: User;
  rank: number;
  group?: string;
}

// 試合情報の型定義
interface Game {
  name: string;
  image: string;
  rankings: Array<Ranking>;
}

class EventGameCsvCommand extends SubcommandInteraction {
  command = new SlashCommandSubcommandBuilder()
    .setName('csv')
    .setDescription('CSVファイルから試合結果をまとめて登録します')
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('試合結果のCSVファイル')
        .setRequired(true),
    );

  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();
    const event = await eventManager.getEvent(interaction);
    if (!event) {
      await interaction.editReply({
        content: 'イベントが見つかりませんでした',
      });
      return;
    }

    const csvFile = interaction.options.getAttachment('file');
    // ファイルを読み込む
    const csvUrl = csvFile?.url;
    if (!csvUrl) {
      await interaction.editReply({
        content: 'ファイルのURLが取得できませんでした',
      });
      return;
    }
    // ファイルを読み込む
    const response = await fetch(csvUrl);
    if (!response.ok) {
      await interaction.editReply({
        content: 'ファイルの取得に失敗しました',
      });
      return;
    }
    // CSVを読み込む
    const csvText = await response.text();
    // csv-parseでパースする
    const csv = parse(csvText);

    // レコードを取得する
    const record = (await csv.toArray()) as string[][];

    // メッセージを送信
    await interaction.editReply({
      content: 'CSVから試合結果を登録しています...',
    });
    // イベントの出欠状況を登録する
    await this._parseAndRegisterGameResults(interaction, event, record);
    // メッセージを送信
    await interaction.followUp({
      content: '試合結果を登録しました',
    });
  }

  /**
   * CSVからイベントの出欠状況を登録する
   * @param interaction インタラクション
   * @param event イベント
   * @param records CSVのレコード
   */
  private async _parseAndRegisterGameResults(
    interaction: ChatInputCommandInteraction,
    event: Event,
    records: string[][],
  ): Promise<void> {
    // CSVの内容を解析して必要なデータを抽出する
    const participants: Participant[] = [];
    const games: Game[] = [];

    // 参加者情報を取得 (A列は名前、B列はID、A5以降は参加者)
    for (let i = 4; i < records.length; i++) {
      const row = records[i];
      participants.push({
        name: row[0],
        id: row[1],
      });
    }

    // 試合情報を取得 (D列以降、D1セルはゲーム名、D2セルは画像ID、D5以降は順位)
    for (let j = 3; j < records[0].length; j++) {
      const gameName = records[0][j];
      const imageId = records[1][j];
      const rankings: Array<Ranking> = [];

      // 試合名が空の場合はスキップ
      if (!gameName) continue;

      // 参加者の順位を取得
      for (let i = 4; i < records.length; i++) {
        // 順位またはIDが空の場合はスキップ
        if (!records[i][1] || !records[i][j]) continue;

        // 参加者を取得
        const member = await interaction.guild?.members
          .fetch(records[i][1])
          .catch(() => undefined);
        const participant = member
          ? await userManager.getOrCreateUser(member)
          : await userManager.createUser({
              userId: records[i][1],
              memberName: records[i][0],
            });

        // 順位を取得
        rankings.push({
          participant,
          rank: parseInt(records[i][j]),
        });
      }

      // ランクごとにグループ分け
      const grouped: { [key: number]: Ranking[] } = rankings.reduce(
        (acc, cur) => {
          acc[cur.rank] = acc[cur.rank] || [];
          acc[cur.rank].push(cur);
          return acc;
        },
        {} as { [key: number]: Ranking[] },
      );

      // 個人戦かチーム戦かを判定
      const isTeam = Object.values(grouped).some((group) => group.length > 1);
      // チーム戦の場合はグループを設定
      if (isTeam) {
        for (const spec of rankings) {
          spec.group =
            Object.keys(grouped).length === 2
              ? ['勝ち', '負け'][spec.rank - 1]
              : `${spec.rank}位`;
        }
      }
      // 0位のランキングユーザーは参加者として扱う
      for (const ranking of rankings) {
        if (ranking.rank === 0) {
          ranking.group = '参加';
        }
      }

      // 試合情報を追加
      games.push({
        name: gameName,
        image: imageId,
        rankings: rankings,
      });
    }

    // 最後の試合番号を取得
    let gameNumber = await getGameResultNumbering(event.id);

    // 試合結果を登録するための処理
    for (const game of games) {
      const editData: AddGameData = {
        game: {
          eventId: event.id, // 適切なイベントIDを設定する
          name: game.name,
          url: null,
          image: game.image ? game.image : null,
        },
        users: game.rankings.map((ranking) => ({
          eventId: event.id,
          userId: ranking.participant.id,
          rank: ranking.rank,
          group: ranking.group,
          xp:
            ranking.rank === 0
              ? 0.1 // 参加者のXPは0.1
              : (xpMap[ranking.rank] ?? 0),
        })),
        updateUsers: true,
        gameNumber,
      };

      // 試合結果を登録
      try {
        const game = await eventGameCommand.addGameResult(event, editData);

        // 登録結果を表示
        const embeds = makeEmbed(
          new EmbedBuilder()
            .setTitle(`🎮「${game.name}」の結果が記録されました`)
            .setDescription(`第 ${editData.gameNumber} 回目の試合結果です`),
          game,
        );

        // メッセージを送信
        await interaction.followUp({
          embeds: [embeds],
        });
      } catch (error) {
        // エラーが発生した場合はエラーメッセージを送信
        await interaction.followUp({
          content: `試合「${game.name}」の結果の登録に失敗しました`,
        });
        logger.error(`試合「${game.name}」の結果の登録に失敗しました`, error);
      }

      // 試合番号をインクリメント
      gameNumber++;
    }
  }
}

export default new EventGameCsvCommand(eventCommand);
