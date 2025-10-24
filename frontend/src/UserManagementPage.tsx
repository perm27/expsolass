import React, { useState, useEffect, useCallback } from 'react';
import { fetchAuthSession, AuthUser } from 'aws-amplify/auth'; 
import { Amplify } from 'aws-amplify';
import outputs from './amplify_outputs.json';

// 💡 [修正]: UserEditModalのインポートは不要となりました
// import { UserEditModal } from './UserEditModal'; 

interface User {
  username: string;
  email: string;
  name: string;
  depart: string;
  status: string;
  groups: string[]; // 所属グループの配列
}
// UserEditModal は今回は使用しないため、インポートをコメントアウトするか削除します。

// API GatewayのベースURLを直接取得
const API_URL_BASE = outputs.custom?.API?.UserManagerApi?.endpoint;
const API_PATH = '/users';

// User[] の型アサーションに使用する Type Guard
const isUserArray = (data: any): data is User[] => {
  return Array.isArray(data) && 
            (data.length === 0 || 
             (typeof data[0] === 'object' && 'username' in data[0] && 'groups' in data[0]));
};

interface UserManagementPageProps {
  authenticatedUser: AuthUser | undefined; 
}

export function UserManagementPage({ authenticatedUser }: UserManagementPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [fetchTrigger, setFetchTrigger] = useState(0); 

  // --- 新規ユーザー登録用のState ---
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormState, setCreateFormState] = useState({
      username: '',
      password: '',
      email: '',
      depart: '', 
      name: '', 
      
      addToAdminGroup: false, 
      addToCreatingBotAllowedGroup: false, 
      addToPublishAllowedGroup: false,     
  });

  // --- 💡 [追加]: ユーザー編集用のState ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormState, setEditFormState] = useState({
      username: '', // 編集対象のユーザー名 (Email)
      email: '',    // Email (通常編集不可)
      depart: '',   // 部署名
      name: '',     // 表示名
      // グループ割り当てフラグ
      addToAdminGroup: false,
      addToCreatingBotAllowedGroup: false,
      addToPublishAllowedGroup: false,
  });

  const refetchUsers = useCallback(() => {
    setFetchTrigger(prev => prev + 1);
  }, []); 

  // ----------------------------------------------------
  // 1. Admin権限チェックとデータ取得の統合 (useEffect)
  // ----------------------------------------------------
  useEffect(() => {
    let isMounted = true; 
    setLoading(true); 

    if (!authenticatedUser) {
        if (isMounted) {
            setIsAdmin(false);
            setLoading(false);
        }
        return;
    }
    
    const checkAdminAndFetch = async () => {
        setError(null);

        if (!API_URL_BASE) {
            if (isMounted) {
                setError('API設定が見つかりません。バックエンドを再デプロイしてください。');
                setLoading(false);
            }
            return;
        }

        // Admin権限チェックロジック
        let isAdminUser = false;
        try {
            const session = await fetchAuthSession(); 
            const groupsPayload = session.tokens?.idToken?.payload['cognito:groups'];
            const groups = Array.isArray(groupsPayload) 
                ? (groupsPayload as string[]) 
                : [];
                
            if (groups.includes('Admin')) { 
                isAdminUser = true;
            }
        } catch (err) {
            if (isMounted) {
                 console.error('Failed to get auth session for Admin check:', err);
                 setIsAdmin(false);
                 setLoading(false);
                 return;
            }
        }
        
        if (isMounted) {
            setIsAdmin(isAdminUser);
        }

        if (!isAdminUser) {
             if (isMounted) setLoading(false);
             return; 
        }


        // ユーザー一覧取得ロジック
        const urlPath = `${API_URL_BASE.replace(/\/$/, '')}${API_PATH}`;

        try {
            const session = await fetchAuthSession();
            const idToken = session.tokens?.idToken?.toString();
            
            if (!idToken) {
                throw new Error('認証トークンが取得できませんでした。再ログインしてください。');
            }

            const response = await fetch(urlPath, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${idToken}`, 
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`APIリクエスト失敗: ${response.status} - ${errorBody}`);
            }

            const json = await response.json();

            if (isMounted && isUserArray(json)) { 
                setUsers(json); 
            } else if (isMounted) {
                console.error('API returned data in unexpected format:', json);
                throw new Error('APIから予期しない形式のデータが返されました。(グループ情報が不足している可能性があります)');
            }

        } catch (err) {
            if (isMounted) { 
                console.error('Error fetching users:', err);
                const errorMessage = (err as Error).message.includes('401')
                    ? '認証が無効です。再度サインインしてください。'
                    : `ユーザー一覧の取得に失敗しました: ${(err as Error).message}`;
                    
                setError(errorMessage);
            }
        } finally {
            if (isMounted) { 
                setLoading(false);
            }
        }
    };

    checkAdminAndFetch();

    return () => {
        isMounted = false; 
    };
    
  }, [fetchTrigger, authenticatedUser]);


  // ----------------------------------------------------
  // 2. 新規ユーザー作成処理 
  // ----------------------------------------------------
  const handleCreateFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value, type, checked } = e.target;
      
      setCreateFormState(prev => ({ 
          ...prev, 
          [name]: type === 'checkbox' ? checked : value
      }));
  };

  const handleCreateUser = async () => {
      const { 
        password, email, name, depart, 
        addToAdminGroup, addToCreatingBotAllowedGroup, addToPublishAllowedGroup
      } = createFormState;

      if ( !password || !email || !name) {
          alert('パスワード、Email、表示名は必須です。');
          return;
      }
      
      if (!API_URL_BASE) return;
      const urlPath = `${API_URL_BASE.replace(/\/$/, '')}${API_PATH}`;

      try {
          const session = await fetchAuthSession();
          const accessToken = session.tokens?.idToken?.toString();
          if (!accessToken) throw new Error('認証トークンが見つかりません。');
          
          const response = await fetch(urlPath, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${accessToken}`, 
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                  username: email, 
                  password, 
                  email, 
                  name,
                  depart, 
                  addToAdminGroup, 
                  addToCreatingBotAllowedGroup, 
                  addToPublishAllowedGroup
              }),
          });

          if (!response.ok) {
              const errorBody = await response.json();
              throw new Error(`作成失敗: ${response.status} - ${errorBody.message || '不明なエラー'}`);
          }
          
          alert(`ユーザー ${email} を作成しました。`);
          setIsCreateModalOpen(false);
          // フォームをリセット 
          setCreateFormState({ 
              username: '', password: '', email: '', 
              depart: '', name: '', 
              addToAdminGroup: false, 
              addToCreatingBotAllowedGroup: false, 
              addToPublishAllowedGroup: false 
          }); 
          refetchUsers(); // リストを更新
      } catch (err) {
          console.error('Error creating user:', err);
          alert(`新規ユーザー登録に失敗しました: ${(err as Error).message}`);
      }
  };


  // ----------------------------------------------------
  // 3. ユーザー編集モーダルを開く関数
  // ----------------------------------------------------
  const handleEdit = (user: User) => {
      const userGroups = user.groups || [];

      setEditFormState({
          username: user.username,
          email: user.email || '', // emailがundefinedの場合を考慮
          name: user.name || '',
          depart: user.depart || '',
          // グループの状態を初期化
          addToAdminGroup: userGroups.includes('Admin'),
          addToCreatingBotAllowedGroup: userGroups.includes('CreatingBotAllowed'),
          addToPublishAllowedGroup: userGroups.includes('PublishAllowed'),
      });
      setIsEditModalOpen(true); // 編集モーダルを開く
  };

  // ----------------------------------------------------
  // 4. 編集フォームの変更ハンドラ
  // ----------------------------------------------------
  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value, type, checked } = e.target;
      
      setEditFormState(prev => ({ 
          ...prev, 
          [name]: type === 'checkbox' ? checked : value
      }));
  };

  // ----------------------------------------------------
  // 5. ユーザー更新処理
  // ----------------------------------------------------
  const handleUpdateUser = async () => {
      const { 
          username, email, name, depart, 
          addToAdminGroup, addToCreatingBotAllowedGroup, addToPublishAllowedGroup
      } = editFormState;

      if (!username || !email || !name) {
          alert('Email、表示名は必須です。');
          return;
      }

      if (!API_URL_BASE) return;
      const urlPath = `${API_URL_BASE.replace(/\/$/, '')}${API_PATH}/${username}`;

      try {
          const session = await fetchAuthSession();
          const accessToken = session.tokens?.idToken?.toString();
          if (!accessToken) throw new Error('認証トークンが見つかりません。');
          
          // APIに送信する設定したいグループのリスト
          const groupsToSet: string[] = [];
          if (addToAdminGroup) groupsToSet.push('Admin');
          if (addToCreatingBotAllowedGroup) groupsToSet.push('CreatingBotAllowed');
          if (addToPublishAllowedGroup) groupsToSet.push('PublishAllowed');

          const response = await fetch(urlPath, {
              method: 'PUT', // PUTメソッドで更新
              headers: {
                  'Authorization': `Bearer ${accessToken}`, 
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                  email, 
                  name,
                  depart, 
                  groupsToSet, // 最終的に設定したいグループリストを送信
              }),
          });

          if (!response.ok) {
              const errorBody = await response.json();
              throw new Error(`更新失敗: ${response.status} - ${errorBody.message || '不明なエラー'}`);
          }
          
          alert(`ユーザー ${username} の情報を更新しました。`);
          setIsEditModalOpen(false);
          refetchUsers(); // リストを更新
      } catch (err) {
          console.error('Error updating user:', err);
          alert(`ユーザー情報の更新に失敗しました: ${(err as Error).message}`);
      }
  };

  // ----------------------------------------------------
  // 6. ユーザー削除
  // ----------------------------------------------------
  const handleDelete = async (username: string) => {
    if (!window.confirm(`ユーザー ${username} を削除しますか？`)) return;

    if (!API_URL_BASE) return;
    const urlPath = `${API_URL_BASE.replace(/\/$/, '')}${API_PATH}/${username}`;

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) throw new Error('認証トークンが見つかりません。');
      
      const response = await fetch(urlPath, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`, 
        },
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`削除失敗: ${response.status} - ${errorBody}`);
      }
      
      alert(`ユーザー ${username} は正常に削除されました。`);
      refetchUsers(); 
    } catch (err) {
      console.error('Error deleting user:', err);
      alert(`ユーザーの削除に失敗しました: ${(err as Error).message}`);
    }
  };


  if (loading) return <p>ロード中...</p>;
  if (error) return <p style={{ color: 'red' }}>エラー: {error}</p>;
  
  if (!authenticatedUser) return <p>認証が完了するまでお待ちください...</p>; 

  if (!isAdmin) return <p>ようこそ、一般ユーザーさん。</p>; 
  return (
    <div style={{ padding: '20px' }}>
      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>登録ユーザー一覧</h2>
          <div>
              <button 
                  onClick={() => setIsCreateModalOpen(true)} 
                  style={{ marginRight: '10px', padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
              >
                  新規ユーザー登録
              </button>
              <button onClick={refetchUsers} style={{ padding: '10px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                  一覧を更新
              </button>
          </div>
      </div>
      
      {/* ユーザー一覧テーブル */}
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ padding: '10px' }}>部署名</th> 
            <th style={{ padding: '10px' }}>表示名</th> 
            <th style={{ padding: '10px' }}>Email</th>
            <th style={{ padding: '10px' }}>Status</th>
            <th style={{ padding: '10px' }}>所属グループ</th>
            <th style={{ padding: '10px' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.username} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '10px' }}>{user.depart || '-'}</td>
              <td style={{ padding: '10px' }}>{user.name || '-'}</td>
              <td style={{ padding: '10px' }}>{user.email || 'N/A'}</td>
              <td style={{ padding: '10px' }}>{user.status}</td>
              <td style={{ padding: '10px' }}>
                {user.groups && user.groups.length > 0
                    ? user.groups.join(', ') 
                    : 'なし'}
              </td> 
              <td style={{ padding: '10px' }}>
                <button onClick={() => handleEdit(user)} style={{ cursor: 'pointer' }}>編集</button>
                <button onClick={() => handleDelete(user.username)} style={{ marginLeft: '10px', color: 'red', cursor: 'pointer' }}>削除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------------------------------------------------- */}
      {/* 新規ユーザー登録モーダル */}
      {/* ---------------------------------------------------- */}
      {isCreateModalOpen && (
        <div style={{ 
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 
        }}>
            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <h3>新規ユーザー登録</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                    
                    <input
                        type="email"
                        name="email"
                        value={createFormState.email}
                        onChange={handleCreateFormChange}
                        placeholder="Emailアドレス (必須)"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <input
                        type="password"
                        name="password"
                        value={createFormState.password}
                        onChange={handleCreateFormChange}
                        placeholder="一時パスワード (必須)"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <input
                        type="text"
                        name="depart"
                        value={createFormState.depart}
                        onChange={handleCreateFormChange}
                        placeholder="部署名"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <input
                        type="text"
                        name="name"
                        value={createFormState.name}
                        onChange={handleCreateFormChange}
                        placeholder="表示名"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    
                    <div style={{ marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', fontSize: '14px' }}>グループ割り当て</p>
                        
                        {/* 1. Adminグループ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <input
                                type="checkbox"
                                name="addToAdminGroup"
                                checked={createFormState.addToAdminGroup}
                                onChange={handleCreateFormChange}
                                id="group-admin"
                                style={{ width: '16px', height: '16px', margin: 0 }}
                            />
                            <label htmlFor="group-admin" style={{ cursor: 'pointer', fontSize: '14px' }}>
                                Admin
                            </label>
                        </div>

                        {/* 2. CreatingBotAllowedグループ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <input
                                type="checkbox"
                                name="addToCreatingBotAllowedGroup"
                                checked={createFormState.addToCreatingBotAllowedGroup}
                                onChange={handleCreateFormChange}
                                id="group-creatingbot"
                                style={{ width: '16px', height: '16px', margin: 0 }}
                            />
                            <label htmlFor="group-creatingbot" style={{ cursor: 'pointer', fontSize: '14px' }}>
                                CreatingBotAllowed
                            </label>
                        </div>
                        
                        {/* 3. PublishAllowedグループ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="checkbox"
                                name="addToPublishAllowedGroup"
                                checked={createFormState.addToPublishAllowedGroup}
                                onChange={handleCreateFormChange}
                                id="group-publish"
                                style={{ width: '16px', height: '16px', margin: 0 }}
                            />
                            <label htmlFor="group-publish" style={{ cursor: 'pointer', fontSize: '14px' }}>
                                PublishAllowed
                            </label>
                        </div>
                    </div>


                    <button 
                        onClick={handleCreateUser}
                        style={{ marginTop: '20px', padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                        disabled={!createFormState.password || !createFormState.email || !createFormState.name}
                    >
                        ユーザーを作成
                    </button>
                    <button 
                        onClick={() => setIsCreateModalOpen(false)}
                        style={{ padding: '10px', backgroundColor: '#f4f4f4', color: '#333', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                    >
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
      )}


      {/* ---------------------------------------------------- */}
      {/* ユーザー編集モーダル */}
      {/* ---------------------------------------------------- */}
      {isEditModalOpen && (
        <div style={{ 
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', 
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 
        }}>
            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <h3>ユーザー編集: {editFormState.name}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                    
                    {/* Email (編集不可) */}
                    <input
                        type="email"
                        name="email"
                        value={editFormState.email}
                        readOnly 
                        disabled
                        placeholder="Emailアドレス"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#f0f0f0' }}
                    />
                    {/* 部署名 */}
                    <input
                        type="text"
                        name="depart"
                        value={editFormState.depart}
                        onChange={handleEditFormChange}
                        placeholder="部署名 (custom:department)"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    {/* 表示名 */}
                    <input
                        type="text"
                        name="name"
                        value={editFormState.name}
                        onChange={handleEditFormChange}
                        placeholder="表示名 (custom:namex, 必須)"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    
                    {/* グループ割り当てチェックボックス */}
                    <div style={{ marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                        <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', fontSize: '14px' }}>所属グループの編集</p>
                        
                        {/* 1. Adminグループ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <input
                                type="checkbox"
                                name="addToAdminGroup"
                                checked={editFormState.addToAdminGroup}
                                onChange={handleEditFormChange}
                                id="edit-group-admin"
                                style={{ width: '16px', height: '16px', margin: 0 }}
                            />
                            <label htmlFor="edit-group-admin" style={{ cursor: 'pointer', fontSize: '14px' }}>
                                Admin
                            </label>
                        </div>

                        {/* 2. CreatingBotAllowedグループ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                            <input
                                type="checkbox"
                                name="addToCreatingBotAllowedGroup"
                                checked={editFormState.addToCreatingBotAllowedGroup}
                                onChange={handleEditFormChange}
                                id="edit-group-creatingbot"
                                style={{ width: '16px', height: '16px', margin: 0 }}
                            />
                            <label htmlFor="edit-group-creatingbot" style={{ cursor: 'pointer', fontSize: '14px' }}>
                                CreatingBotAllowed
                            </label>
                        </div>
                        
                        {/* 3. PublishAllowedグループ */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="checkbox"
                                name="addToPublishAllowedGroup"
                                checked={editFormState.addToPublishAllowedGroup}
                                onChange={handleEditFormChange}
                                id="edit-group-publish"
                                style={{ width: '16px', height: '16px', margin: 0 }}
                            />
                            <label htmlFor="edit-group-publish" style={{ cursor: 'pointer', fontSize: '14px' }}>
                                PublishAllowed
                            </label>
                        </div>
                    </div>


                    <button 
                        onClick={handleUpdateUser} 
                        style={{ marginTop: '20px', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                        disabled={!editFormState.email || !editFormState.name}
                    >
                        ユーザー情報を更新
                    </button>
                    <button 
                        onClick={() => setIsEditModalOpen(false)}
                        style={{ padding: '10px', backgroundColor: '#f4f4f4', color: '#333', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                    >
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

