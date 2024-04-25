# Discordイベント出席記録Bot

Discordでイベントに出席した人を記録し、統計の表示や出席者の確認ができるBotです。


## 使い方 (イベント主催者)

### イベントの作成

Discordのイベント機能を使ってイベントを作成します。  
イベントの種類は、ボイスチャンネルまたはステージチャンネル である必要があります。  

イベントを開始すると、Botがイベントに出席した人を記録し始めます。  

### 出席者のレビュー

`/event review` コマンドを使って、出席者の一覧を表示できます。  
コンフィグの `required_time` で指定した時間(デフォルトは10分)以上参加しているユーザーのみが表示されます。  

プルダウンメニューからユーザーを選択することで、そのユーザーの出欠フラグを変更することができます。  
出席フラグになっているユーザーのみが、 `/event show` や `/status` コマンドで表示されます。  

![2024-04-26_00h58_02](https://github.com/Kamesuta/discord-event-attendance/assets/16362824/36f45778-1eca-4225-8cd6-1071f0d626b3)

### イベント詳細、出席者の表示

`/event show` コマンドを使って、出席者の一覧を表示できます。  
アナウンスチャンネルなどに貼り付けることで、出席者をわかりやすく表示できます。  

![2024-04-26_00h58_14](https://github.com/Kamesuta/discord-event-attendance/assets/16362824/1be0b6b7-15e9-4c71-8fa5-29627146f98d)

### ゲーム戦績の記録

`/event game` コマンドを使って、ゲームの戦績を記録できます。  
ゲームの結果を記録することで、ゲームの順位やXPの表示ができます。(WIP)  
```
/event game <ゲーム名> <1位のユーザー名> [2位のユーザー名] ... [XP倍率] [ゲーム結果のURL]
```

![2024-04-26_00h58_26](https://github.com/Kamesuta/discord-event-attendance/assets/16362824/0fa65f90-83b1-4a8c-908b-6c38df20804f)


## 使い方 (利用者)

### ステータスの確認

- `/status` コマンドを使って、自分の出席ステータスを確認できます。
- `/status [ユーザー名]` で他のユーザーのステータスを確認することもできます。
- `/status show:True` でチャットにステータスを公開することもできます。

![2024-04-26_00h58_36](https://github.com/Kamesuta/discord-event-attendance/assets/16362824/31ef646e-3773-43bd-ab94-f68ad1bc234b)


## 今後の予定

- イベント詳細の表示時に、ゲームの戦績(XPや順位)を表示する
- ゲームについて詳しく確認できるようにする
- CSVやGoogleスプレッドシートに出席者の情報をエクスポートする
- ロールの付与や剥奪を自動化する
