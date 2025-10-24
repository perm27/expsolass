// frontend/src/UserEditModal.tsx
import React, { useState, useEffect } from 'react';
//import { put } from 'aws-amplify/api';


import { fetchAuthSession } from 'aws-amplify/auth';
import outputs from './amplify_outputs.json'; // API URLを取得するために必要

// API GatewayのベースURLを再度定義
const API_URL_BASE = outputs.custom?.API?.UserManagerApi?.endpoint;
const API_PATH_PREFIX = '/users'; // /users/{id} になるように使用


// ユーザーデータの型定義
export interface User {
  username: string;
  email?: string;
  // 💡 [修正]: name 属性を追加
  depart?: string; 
  name?: string; 
  status?: string;
  enabled?: boolean;
  createdAt?: Date;
  // Cognitoで管理する他の属性もここに追加可能
}

interface UserEditModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  onUpdateSuccess: () => void;

  //currentUser: User; // ユーザー情報
  // 💡 [修正点] 更新後に親コンポーネントを再描画するためのコールバック関数を追加
  onUpdate: () => void; 

}

//const API_NAME = 'UserManagerApi';
//const API_PATH = '/users';

export function UserEditModal({ user, isOpen, onClose, onUpdateSuccess, onUpdate }: UserEditModalProps) {
  const [email, setEmail] = useState(user.email || '');
  // 💡 [修正]: name の State を追加
  const [name, setName] = useState(user.name || ''); 
  //const [isUpdating, setIsUpdating] = useState(false);
  const [isUpdating] = useState(false);

  useEffect(() => {
    setEmail(user.email || '');
    // 💡 [修正]: name の State を同期
    setName(user.name || ''); 
  }, [user]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    //setIsUpdating(true);


    if (!API_URL_BASE) {
        alert('API設定が見つかりません。');
        return;
    }
    
    // 💡 呼び出す完全なURLを作成 (PUT /users/{username})
    //const urlPath = `${API_URL_BASE.replace(/\/$/, '')}${API_PATH_PREFIX}/${currentUser.username}`;
    const urlPath = `${API_URL_BASE.replace(/\/$/, '')}${API_PATH_PREFIX}/${user.username}`;

    try {
        // 1. 認証トークンの取得 (Access Tokenを使用)
        const session = await fetchAuthSession();
        //const accessToken = session.tokens?.accessToken?.toString();
        const accessToken = session.tokens?.idToken?.toString();
        if (!accessToken) {
            throw new Error('認証トークンが取得できませんでした。');
        }


        // 2. PUT fetch API で API Gateway を直接呼び出し
        const response = await fetch(urlPath, {
            method: 'PUT',
            headers: {
                'Authorization': accessToken, // 💡 Access Tokenを手動で追加
                'Content-Type': 'application/json',
            },
            // 💡 サーバーに送るデータ（今回はemailとgiven_nameを想定）
            body: JSON.stringify({ 
                email: email,
                name: name,
                //given_name: 'givenName',
                //given_name: givenName,
                // 他の更新属性があれば追加
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`更新失敗: ${response.status} - ${errorBody}`);
        }

        // 成功時の処理
        alert('ユーザー情報が正常に更新されました。');
        onClose(); // モーダルを閉じる
        onUpdate(); // 親コンポーネント（UserManagementPage）に再描画を指示
        
    } catch (err) {
        console.error("Update error:", err);
        // 💡 具体的なエラーメッセージを表示
        alert(`ユーザー更新に失敗しました: ${(err as Error).message}`); 
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div style={modalContentStyle}>
        <h3>ユーザー情報編集: {user.name}</h3>
        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name">表示名:</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ marginLeft: '10px' }}
            />
          </div>
		{/*
          <div>
            <label htmlFor="email">Email:</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ marginLeft: '10px', width: '80%' }}
            />
          </div>
		*/}
          <p style={{marginTop: '15px'}}>その他の属性も同様に追加・編集可能です。</p>
          <div style={{ marginTop: '20px', textAlign: 'right' }}>
            <button type="button" onClick={onClose} disabled={isUpdating}>キャンセル</button>
            <button type="submit" disabled={isUpdating} style={{ marginLeft: '10px' }}>
              {isUpdating ? '更新中...' : '更新'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 簡易的なモーダルのスタイル定義
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
  backgroundColor: 'white',
  padding: '30px',
  borderRadius: '8px',
  minWidth: '400px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
};
