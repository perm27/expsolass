import React, { useState, useEffect } from 'react'; 
import './App.css';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import outputs from './amplify_outputs.json';
import { UserManagementPage } from './UserManagementPage';
import { ChangePassword } from './ChangePassword'; // ChangePasswordのインポート
// 💡 [統合済み]: 必要な関数と型をすべて1行にまとめる
import { fetchUserAttributes, AuthUser, fetchAuthSession } from 'aws-amplify/auth'; 


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
    const [loadingAttributes, setLoadingAttributes] = useState<boolean>(false);
    // 💡 [追加]: パスワード変更フォームの表示状態を管理
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false); 


    // 💡 認証ユーザーが変更されたとき、またはコンポーネントがマウントされたときに属性を取得
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
                
                // 'name' 属性、または 'custom:namex' 属性を優先して表示名とする
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
        
    }, [authenticatedUser]); 


    // Authenticatorのレンダリング
    return (
        <Authenticator

            hideSignUp={true}
            components={{
                // サインイン画面 (signIn) のヘッダーをカスタマイズ
                Header() {
                    // Header のスタイルを定義
                    const headerStyle: React.CSSProperties = {
                        padding: '20px 0',
                        textAlign: 'center',
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: '#333', // 任意の色
                        borderBottom: '1px solid #ddd',
                        marginBottom: '20px',
                    };

                    return (
                        <div style={headerStyle}>
                          ようこそ、ソルクシーズ・アシスタント、
                          ユーザー管理へ
                        </div>
                    );
                },
            }}
        > 

            {({ signOut, user }) => {
                // Authenticator から渡される user を State にセット
                if (user !== authenticatedUser) {
                    setAuthenticatedUser(user);
                }
                
                return (
                    <main>
                        {/* displayName を表示し、未取得の場合は user.username にフォールバック */}
                        <h1>ようこそ、{displayName || user?.username || 'Guest'}さん！</h1>

                        {/* パスワード変更フォームのトグルボタン */}
                        <div style={{ margin: '20px 0', display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button 
                                onClick={() => setIsChangePasswordOpen(prev => !prev)}
                                style={{ padding: '8px 15px', backgroundColor: '#f0ad4e', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                            >
                                {isChangePasswordOpen ? 'パスワード変更を閉じる' : 'パスワードを変更する'}
                            </button>
                            
                            <button onClick={signOut} style={{ padding: '8px 15px', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                                サインアウト
                            </button>
                        </div>
 
                        {/* 💡 [修正済み]: isChangePasswordOpen が true の場合のみフォームを表示 */}
                        {isChangePasswordOpen && (
                            <ChangePassword onSuccess={() => setIsChangePasswordOpen(false)} />
                        )}

                        {/* 認証済みユーザー情報（AuthUser | undefined）を UserManagementPage に渡す */}
                        <UserManagementPage authenticatedUser={user} />
                        
                    </main>
                );
            }}
        </Authenticator>
    );
}

export default App;

