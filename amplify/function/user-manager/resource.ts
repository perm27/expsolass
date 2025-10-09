// amplify/function/user-manager/resource.ts (修正後の推奨コード)
import { defineFunction } from '@aws-amplify/backend';

export const userManager = defineFunction({
  name: 'userManagerFunction',
  // パーミッションはdefineBackend内のCDKコードで付与するのが、
  // 他のリソース(auth)を参照し、より確実に権限を設定できるため、
  // このファイルをシンプルに保ちます。
});
