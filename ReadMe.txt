Cognito のユーザー管理プログラム
　
　開発時のコード修正、動作確認はローカル側で行い、修正、拡張と動作検証が済んだ
　ところで git へコミット。　aws 上では git へのコミットを捉えてデプロイ、
　サービス更新となります。

　ローカルでの動作
  (各OSのインストール手段で Node.js をインストールしておいてください)
　
  まずは、git clone か zip を解凍してコード類を展開。
　カレントフォルダを解凍されてできたフォルダへ変更。
　
　　・バックエンド側
           必要なライブラリなど展開
      $ npm install
           実行
      $ npx ampx sandbox
       or
      $ npx ampx sandbox --stream-function-logs  
      
      メッセージから "File written: amplify_outputs.json"を確認。
      Cognito のデータプールを用意、フロントエンドへ通知のためにコピー。
      
      $ cp amplify_outputs.json frontend/src

    ・フロントエンド側
           必要なライブラリなど展開
      $ npm install
           実行
      $ npm start

    以降、フロントエンドもバックエンドもコードや設定ファイルを変更すると
　　更新を検出してデプロイ動作などが動きます。
    
  PC からの動作確認
　
　ブラウザから http://localhost:3000 など、アプリの動作確認。

