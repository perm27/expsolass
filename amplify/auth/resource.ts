// amplify/auth/resource.ts
import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  // ... 既存の設定
  loginWith: {
    email: true, // Eメールでログイン
  },
  userAttributes: {
    // ... 既存の属性 (emailなど)
    'custom:name': {
      // 💡 [修正]: required: false は削除。Cognitoカスタム属性には不要です。
      dataType: 'String', 
      mutable: true, // 変更可能
      
      // CognitoのUIで表示される名前
      //displayName: '表示名', 
      
      // 管理者(Admin)およびセルフサービス(User)の両方から読み書き可能にする
      // [注意]: Amplify Gen 2では 'readAccess' や 'writeAccess' の代わりに
      // mutability と access を設定するのが一般的ですが、今回は
      // 既存のコードスタイルに合わせ、読み書き権限の設定を維持します。
      //readAccess: ['admin', 'user'], 
      //writeAccess: ['admin', 'user'], 
    },
  },
  // ... 既存の設定
  groups: ['Admin'],
});
