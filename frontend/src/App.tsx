import React, { useState, useEffect } from 'react';
import './App.css';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import outputs from './amplify_outputs.json';
import { UserManagementPage } from './UserManagementPage';

// ユーザー属性取得、セッション取得、および認証後のユーザー情報取得に必要な関数と型をインポート
import { fetchUserAttributes, getCurrentUser, AuthUser, fetchAuthSession } from 'aws-amplify/auth'; 


// customセクションからAPI設定を取得
const customApiConfig = (outputs as any).custom?.API;

// Amplify.configureに渡す設定オブジェクトを準備
let configToUse = outputs;

// custom API設定が存在する場合
if (customApiConfig) {
    configToUse = {
        ...outputs,
        API: customApiConfig, 
    } as any; 
}

// 修正した設定でAmplifyを構成
Amplify.configure(configToUse);

console.log("------ Amplify.config ------");
const currentConfigAPI = Amplify.getConfig();
console.log(currentConfigAPI);


function App() {
    const [displayName, setDisplayName] = useState<string>('');
    // 💡 [修正]: 認証済みのユーザー情報を格納し、変更を監視するためのState
    const [authenticatedUser, setAuthenticatedUser] = useState<AuthUser | null>(null);
    const [loadingAttributes, setLoadingAttributes] = useState<boolean>(false);


    // 💡 [修正]: authenticatedUser の変更を検知して属性を取得するロジック
    // この useEffect は、ユーザーがサインイン/サインアウトするたびに実行されます。
    useEffect(() => {
        
        async function fetchUserName() {
            // authenticatedUser が null の場合はサインアウト状態とみなし、処理を終了
            if (!authenticatedUser) {
                setDisplayName('');
                return;
            }
            
            setLoadingAttributes(true);
            try {
                // ユーザー属性を取得
                const attributes = await fetchUserAttributes();
                
                // カスタム属性 'custom:name' を取得
                const name = attributes['custom:name']; 
                
                if (name) {
                    setDisplayName(name);
                } else {
                    // 表示名がない場合は、usernameをフォールバックとして使用
                    setDisplayName(authenticatedUser.username); 
                }

                // ----------------------------------------------------
                // 📝 グループ確認ロジック (維持)
                // ----------------------------------------------------
                const { tokens } = await fetchAuthSession();
                const idToken = tokens?.idToken;

                if (idToken) {
                    const claims = idToken.payload as any;
                    const userGroups: string[] = claims['cognito:groups'] || [];
                    console.log('User Groups:', userGroups);
                }
                // ----------------------------------------------------

            } catch (error) {
                console.error('Failed to fetch user attributes:', error);
                setDisplayName(authenticatedUser.username); // エラー時もユーザー名でフォールバック
            } finally {
                setLoadingAttributes(false);
            }
        }

        fetchUserName();
        
    }, [authenticatedUser]); // 💡 [重要]: authenticatedUser が更新されるたびに実行


    // Authenticatorのレンダリング
    return (
        <Authenticator>
            {({ signOut, user }) => {
                // 💡 [修正]: Authenticator から渡される user が変更された場合に State を更新
                // user が存在し、かつ State の authenticatedUser と異なる場合に更新をトリガー
                if (user && authenticatedUser?.username !== user.username) {
                    setAuthenticatedUser(user);
                }
                // user が存在せず、かつ State に authenticatedUser が残っている場合に State をリセット
                if (!user && authenticatedUser) {
                    setAuthenticatedUser(null);
                }
                
                return (
                    <main>
                        {/* displayName または user.username を表示（どちらも未設定の場合は 'Guest' など） */}
                        <h1>ようこそ、{displayName || user?.username || 'Guest'}さん！</h1>
                        <UserManagementPage />
                        <button onClick={signOut}>サインアウト</button>
                    </main>
                );
            }}
        </Authenticator>
    );
}

export default App;
