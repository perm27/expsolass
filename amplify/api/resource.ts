// amplify/api/resource.ts
import { defineApi } from '@aws-amplify/backend'; 

export const api = defineApi({
  // 認証設定の参照 (必要に応じて)
  // 例: auth: { resourceName: 'auth' },

  rest: {
    // API エンドポイントの定義
    users: {
      // 接続されているLambda関数名 (プロジェクトに合わせて関数名を修正してください)
      function: 'userManagerFunction', 

      // CORS設定
      cors: true, 
      // 許可するオリジン（process.env の型定義が必要です）
      allowedOrigins: [
        'http://localhost:3000', 
        'http://127.0.0.1:3000',
        // AMPLIFY_HOSTING_DOMAIN は Amplify Hosting の環境変数
        // (注: 環境によっては AMPLIFY_HOSTING_DOMAIN ではなく、手動で設定したカスタム変数を参照する方が確実です)
        `https://${process.env.AMPLIFY_HOSTING_DOMAIN}` 
      ],
      
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],

      // APIパスの定義
      paths: [
        '/users', 
        '/users/{userId}'
      ],
    },
  },
});

