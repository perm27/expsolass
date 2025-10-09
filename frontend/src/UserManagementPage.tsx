import React, { useState, useEffect, useCallback } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import outputs from './amplify_outputs.json';

// UserEditModal のインポート元が存在すると仮定して維持
// 🚨 注意: UserEditModal はこのファイルで定義されていませんが、既存のプロジェクト構造を維持します。
import { UserEditModal, User } from './UserEditModal'; 

// API GatewayのベースURLを直接取得
const API_URL_BASE = outputs.custom?.API?.UserManagerApi?.endpoint;
const API_PATH = '/users';

// User[] の型アサーションに使用する Type Guard
const isUserArray = (data: any): data is User[] => {
  return Array.isArray(data) && 
            (data.length === 0 || 
             (typeof data[0] === 'object' && 'username' in data[0]));
};

export function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false); // 編集モーダル
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // 💡 [修正]: 新規ユーザー登録用のStateに `addToAdminGroup` を追加 (デフォルト: true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createFormState, setCreateFormState] = useState({
      username: '',
      password: '',
      email: '',
      name: '', // 表示名 (custom:name)
      addToAdminGroup: true, // 💡 [新規] Adminグループへの追加フラグ
  });


  // 1. ユーザー一覧取得 (useCallbackでメモ化)
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!API_URL_BASE) {
      console.error('API_URL_BASE is missing in amplify_outputs.json');
      setError('API設定が見つかりません。バックエンドを再デプロイしてください。');
      setLoading(false);
      return;
    }
    
    const urlPath = `${API_URL_BASE.replace(/\/$/, '')}${API_PATH}`;

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      
      if (!idToken) {
        setError('認証トークンが取得できませんでした。再ログインしてください。');
        setLoading(false);
        return;
      }

      const response = await fetch(urlPath, {
        method: 'GET',
        headers: {
          'Authorization': idToken, 
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`APIリクエスト失敗: ${response.status} - ${errorBody}`);
      }

      const json = await response.json();

      if (isUserArray(json)) {
        setUsers(json); 
      } else {
        console.error('API returned data in unexpected format:', json);
        setError('APIから予期しない形式のデータが返されました。');
      }

    } catch (err) {
      console.error('Error fetching users:', err);
      setError(`ユーザー一覧の取得に失敗しました: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []); // 依存配列は空


  // 2. Admin権限チェック
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const session = await fetchAuthSession();
        
        // 'cognito:groups'ペイロードの値を取得
        const groupsPayload = session.tokens?.idToken?.payload['cognito:groups'];
        
        // 配列であることを確認
        const groups = Array.isArray(groupsPayload) 
             ? (groupsPayload as string[]) 
             : [];
              
        // グループ名 'Admin' をチェック
        if (groups.includes('Admin')) { 
          setIsAdmin(true);
          // 管理者権限がある場合にのみユーザー一覧を取得
          fetchUsers();
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        setError('認証情報の取得中にエラーが発生しました。');
      } finally {
        setLoading(false); 
      }
    };
    checkAdmin();
  }, [fetchUsers]); 


  // ----------------------------------------------------
  // 💡 [新規ロジック]: 新規ユーザー作成処理
  // ----------------------------------------------------
  const handleCreateFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value, type, checked } = e.target; // 💡 [修正]: typeとcheckedを取得
      
      setCreateFormState(prev => ({ 
          ...prev, 
          [name]: type === 'checkbox' ? checked : value // 💡 [修正]: チェックボックスの場合はcheckedを使う
      }));
  };

  const handleCreateUser = async () => {
      // フォームデータの検証
      const { username, password, email, name, addToAdminGroup } = createFormState; // 💡 [修正]: addToAdminGroupを取得

      if (!username || !password || !email || !name) {
          alert('すべてのフィールドを入力してください。');
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
                  'Authorization': accessToken,
                  'Content-Type': 'application/json',
              },
              // 💡 [修正]: addToAdminGroup をボディに追加
              body: JSON.stringify({ username, password, email, name, addToAdminGroup }),
          });

          if (!response.ok) {
              const errorBody = await response.json();
              throw new Error(`作成失敗: ${response.status} - ${errorBody.message || '不明なエラー'}`);
          }
          
          const groupMessage = addToAdminGroup ? 'Adminグループに追加しました。' : '一般ユーザーとして作成しました。';
          alert(`ユーザー ${username} を作成し、${groupMessage}`);
          setIsCreateModalOpen(false);
          // フォームをリセット (Adminグループフラグはデフォルト値に戻す)
          setCreateFormState({ username: '', password: '', email: '', name: '', addToAdminGroup: true }); 
          fetchUsers(); // リストを更新

      } catch (err) {
          console.error('Error creating user:', err);
          alert(`新規ユーザー登録に失敗しました: ${(err as Error).message}`);
      }
  };


  // 3. ユーザー変更モーダル表示 
  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  // 4. ユーザー削除
  const handleDelete = async (username: string) => {
    // 💡 [注意]: window.confirm() は非推奨です。カスタムモーダルに置き換えてください。
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
          'Authorization': idToken,
        },
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`削除失敗: ${response.status} - ${errorBody}`);
      }
      
      alert(`ユーザー ${username} は正常に削除されました。`);
      fetchUsers(); 
    } catch (err) {
      console.error('Error deleting user:', err);
      alert(`ユーザーの削除に失敗しました: ${(err as Error).message}`);
    }
  };


  if (loading) return <p>ロード中...</p>;
  if (error) return <p style={{ color: 'red' }}>エラー: {error}</p>;
  if (!isAdmin) return <p>ようこそ、一般ユーザーさん。</p>; 

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>登録ユーザー一覧</h2>
          <div>
              <button 
                  onClick={() => setIsCreateModalOpen(true)} 
                  style={{ marginRight: '10px', padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
              >
                  新規ユーザー登録
              </button>
              <button onClick={fetchUsers} style={{ padding: '10px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                  一覧を更新
              </button>
          </div>
      </div>
      
      {/* ユーザー一覧テーブル */}
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #ccc' }}>
            <th style={{ padding: '10px' }}>ユーザー名</th>
            <th style={{ padding: '10px' }}>表示名</th> 
            <th style={{ padding: '10px' }}>Email</th>
            <th style={{ padding: '10px' }}>Status</th>
            <th style={{ padding: '10px' }}>Enabled</th>
            <th style={{ padding: '10px' }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.username} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '10px' }}>{user.username}</td>
              <td style={{ padding: '10px' }}>{user.name || '-'}</td>
              <td style={{ padding: '10px' }}>{user.email || 'N/A'}</td>
              <td style={{ padding: '10px' }}>{user.status}</td>
              <td style={{ padding: '10px' }}>{user.enabled ? 'はい' : 'いいえ'}</td>
              <td style={{ padding: '10px' }}>
                <button onClick={() => handleEdit(user)} style={{ cursor: 'pointer' }}>編集</button>
                <button onClick={() => handleDelete(user.username)} style={{ marginLeft: '10px', color: 'red', cursor: 'pointer' }}>削除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ---------------------------------------------------- */}
      {/* 💡 [修正]: 新規ユーザー登録モーダル */}
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
                        type="text"
                        name="username"
                        value={createFormState.username}
                        onChange={handleCreateFormChange}
                        placeholder="ユーザー名 (必須)"
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
                        type="email"
                        name="email"
                        value={createFormState.email}
                        onChange={handleCreateFormChange}
                        placeholder="Emailアドレス (必須)"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <input
                        type="text"
                        name="name"
                        value={createFormState.name}
                        onChange={handleCreateFormChange}
                        placeholder="表示名 (custom:name) (必須)"
                        style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    
                    {/* 💡 [新規]: Adminグループへの追加チェックボックス */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                        <input
                            type="checkbox"
                            name="addToAdminGroup"
                            checked={createFormState.addToAdminGroup}
                            onChange={handleCreateFormChange}
                            id="admin-group-check"
                            style={{ width: '16px', height: '16px', margin: 0 }}
                        />
                        <label htmlFor="admin-group-check" style={{ cursor: 'pointer', fontSize: '14px' }}>
                            Adminグループに割り当てる
                        </label>
                    </div>

                    <button 
                        onClick={handleCreateUser}
                        style={{ marginTop: '20px', padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                        disabled={!createFormState.username || !createFormState.password || !createFormState.email || !createFormState.name}
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


      {selectedUser && (
        <UserEditModal
          user={selectedUser}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onUpdateSuccess={fetchUsers}
          onUpdate={fetchUsers} 
        />
      )}
    </div>
  );
}
