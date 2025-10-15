// amplify/auth/resource.ts
import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  // 1. ユーザーのサインイン方法を定義
  loginWith: {
    email: true, // Eメールでログイン
  },
  
  // 2. ユーザーグループの定義
  groups: ['Admin'],

  // 3. ユーザー属性のカスタマイズ
  userAttributes: {
    // 標準属性の定義
    familyName: { mutable: true, required: false },
    
    // カスタム属性 'custom:name' の定義
    'custom:name': {
      mutable: true,   // ユーザーによる変更を許可
      // 【🌟 修正箇所 🌟】 required: false を削除
      dataType: 'String',
      minLen: 1,
      maxLen: 128,
    },
  },

  // 4. Cognitoユーザープールのカスタム名（任意）
  name: 'MyCustomAuth',
});
