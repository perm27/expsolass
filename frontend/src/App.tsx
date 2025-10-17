import React, { useState, useEffect } from 'react'; // 💡 [追加]: useState, useEffect をインポート
import './App.css';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import outputs from './amplify_outputs.json';
import { UserManagementPage } from './UserManagementPage';
// 💡 [追加]: ユーザー属性取得に必要な関数と型をインポート
import { fetchUserAttributes, AuthUser } from 'aws-amplify/auth'; 


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
    // 💡 [追加]: 表示名（name属性）を保持するためのState
    const [displayName, setDisplayName] = useState<string>(''); 
    // 💡 [追加]: Authenticatorから取得したユーザー情報を保持するためのState
    const [authenticatedUser, setAuthenticatedUser] = useState<AuthUser | undefined>(undefined); 


    // 💡 [新規]: 認証ユーザーが変更されたとき、またはコンポーネントがマウントされたときに属性を取得
    useEffect(() => {
        // userがまだ存在しない、またはログアウトしている場合は処理しない
        if (!authenticatedUser) {
            setDisplayName(''); // ユーザーがいない場合は表示名をリセット
            return;
        }

        const fetchUserNameAttribute = async () => {
            try {
                // 認証済みセッションを使用してユーザー属性を取得
                const attributes = await fetchUserAttributes();
                
                // 💡 [重要]: 'name' 属性、または 'custom:namex' 属性を優先して表示名とする
                // Cognito設定によって属性名が異なる場合があるため、存在するものを優先
                const nameAttribute = attributes.name || (attributes as any)['custom:namex'];

                if (nameAttribute) {
                    setDisplayName(nameAttribute);
                } else {
                    // name属性がない場合は、フォールバックとしてusernameを使用
                    setDisplayName(authenticatedUser.username);
                }

            } catch (error) {
                console.error('Failed to fetch user attributes:', error);
                // 属性取得に失敗した場合も、フォールバックとしてusernameを使用
                setDisplayName(authenticatedUser.username); 
            }
        };

        fetchUserNameAttribute();
        
    }, [authenticatedUser]); // 💡 [重要]: authenticatedUser が変更されるたびに実行


    // Authenticatorのレンダリング
    return (
        <Authenticator>
            {({ signOut, user }) => {
                // 💡 [修正]: Authenticator から渡される user を State にセット
                // useEffectがこの変更を検知して属性取得をトリガーする
                if (user !== authenticatedUser) {
                    setAuthenticatedUser(user);
                }
                
                return (
                    <main>
                        {/* 💡 [修正]: displayName を表示し、未取得の場合は user.username にフォールバック */}
                        <h1>ようこそ、{displayName || user?.username || 'Guest'}さん！</h1>

                        {/* 認証済みユーザー情報（AuthUser | undefined）を UserManagementPage に渡す */}
                        <UserManagementPage authenticatedUser={user} />

                        <button onClick={signOut}>サインアウト</button>
                    </main>
                );
            }}
        </Authenticator>
    );
}

export default App;

