import React, { useState } from 'react';
// Amplify のパスワード変更関数をインポート
import { updatePassword } from 'aws-amplify/auth'; 

interface ChangePasswordProps {
    onSuccess: () => void; // 成功時に呼び出すコールバック
}

export function ChangePassword({ onSuccess }: ChangePasswordProps) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');
        setIsError(false);

        if (newPassword !== confirmPassword) {
            setIsError(true);
            setMessage('新しいパスワードが一致しません。');
            return;
        }

        if (newPassword.length < 8) { // Cognitoのデフォルト最小文字数（設定による）
            setIsError(true);
            setMessage('パスワードは8文字以上で設定してください。');
            return;
        }

        setIsLoading(true);

        try {
            // 💡 [重要]: updatePassword 関数でパスワードを変更
            await updatePassword({ 
                oldPassword, 
                newPassword 
            });

            setIsError(false);
            setMessage('パスワードが正常に変更されました！次回ログインから新しいパスワードを使用してください。');
            
            // 成功後にフォームをリセット
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');

            // 親コンポーネントに成功を通知
            onSuccess(); 

        } catch (error) {
            setIsError(true);
            console.error('Password update failed:', error);
            // エラーコードに応じてユーザーに分かりやすいメッセージを表示
            if ((error as Error).message.includes('LimitExceededException')) {
                 setMessage('パスワード変更の試行回数が上限を超えました。しばらく待ってから再度お試しください。');
            } else if ((error as Error).message.includes('InvalidParameterException')) {
                 setMessage('パスワードがセキュリティ要件を満たしていません。数字、特殊文字、大文字/小文字を含めてください。');
            } else {
                 setMessage(`パスワード変更に失敗しました: ${(error as Error).message}`);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // ----------------------------------------------------
    // 簡易的なフォームデザイン
    // ----------------------------------------------------
    return (
        <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '400px', margin: '20px auto', backgroundColor: '#f9f9f9' }}>
            <h3 style={{ marginTop: 0 }}>パスワードの変更</h3>
            
            {message && (
                <p style={{ color: isError ? 'red' : 'green', fontWeight: 'bold' }}>
                    {message}
                </p>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <input
                    type="password"
                    placeholder="現在のパスワード"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    style={inputStyle}
                />
                <input
                    type="password"
                    placeholder="新しいパスワード"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    style={inputStyle}
                />
                <input
                    type="password"
                    placeholder="新しいパスワード（確認）"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    style={inputStyle}
                />

                <button 
                    type="submit" 
                    disabled={isLoading}
                    style={{ ...buttonStyle, backgroundColor: isLoading ? '#aaa' : '#007bff' }}
                >
                    {isLoading ? '処理中...' : 'パスワードを変更'}
                </button>
            </form>
        </div>
    );
}

// 簡易スタイル定義
const inputStyle: React.CSSProperties = {
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid #ddd',
};

const buttonStyle: React.CSSProperties = {
    padding: '10px',
    borderRadius: '4px',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
};
