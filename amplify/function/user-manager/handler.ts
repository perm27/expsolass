import { 
    CognitoIdentityProviderClient, 
    ListUsersCommand, 
    AdminDeleteUserCommand, 
    AdminUpdateUserAttributesCommand,
    AdminCreateUserCommand,
    AdminAddUserToGroupCommand,
    AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// 💡 [最終修正]: TypeScriptのTS2580エラー「Cannot find name 'process'」を回避するため、
// globalThis を使用して process オブジェクトにアクセスします。
const USER_POOL_ID = (globalThis as any).process.env.USER_POOL_ID;
const cognitoClient = new CognitoIdentityProviderClient({});

// CORSエラーを防ぐため、すべてのレスポンスヘッダーを定義
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', // 開発中はワイルドカード (*) で許可
    //'Access-Control-Allow-Origin': 'http://192.168.49.241:3000',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
};

// ユーザーデータの形式を統一
interface UserData {
    username: string;
    email?: string;
    name?: string;
    status?: string;
    enabled?: boolean;
    createdAt?: Date;
}

/**
 * Cognitoユーザー属性を整形してUserData形式に変換するヘルパー関数
 */
const mapCognitoUserToUserData = (user: any): UserData => {
    const attributesMap = user.Attributes?.reduce((acc: any, attr: AttributeType) => {
        if (attr.Name && attr.Value) {
            acc[attr.Name] = attr.Value;
        }
        return acc;
    }, {});

    // Cognitoでは、UsernameがEmailに設定されている場合、そのままUsernameとして使用
    return {
        username: user.Username, // ここにはEmailアドレスが入っているはず (例: user@example.com)
        email: attributesMap?.email,
        name: attributesMap?.['custom:name'],
        status: user.UserStatus,
        enabled: user.Enabled,
        createdAt: user.UserCreateDate,
    };
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!USER_POOL_ID) {
        console.error("USER_POOL_ID is not set in environment variables.");
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: 'Internal configuration error.' }),
        };
    }

    const { httpMethod, pathParameters, body } = event;
    // 💡 修正: pathParameters.proxy ではなく pathParameters.id を使用
    const usernameParam = pathParameters?.id; 

    try {
        switch (httpMethod) {
            
            case 'OPTIONS':
                // CORS Preflightリクエストへの応答
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'CORS Preflight Success' }),
                };

            // 新規ユーザー作成 (POST /users)
            case 'POST':
                if (!body) throw new Error('Request body is missing.');
                
                const createData = JSON.parse(body);
                // フロントエンドから受け取るデータ
                const { password, email, name, addToAdminGroup } = createData; 
                
                // CognitoがUsernameとしてEmailを要求しているため、EmailをUsernameに設定
                const cognitoUsername = email;

                if (!cognitoUsername || !password || !email || !name) {
                    throw new Error('Missing required fields: password, email, or name.');
                }

                // 1. ユーザー作成 (AdminCreateUserCommand)
                const createUserCommand = new AdminCreateUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: cognitoUsername, // EmailをUsernameとして使用
                    TemporaryPassword: password,
                    UserAttributes: [
                        { Name: 'email', Value: email },
                        // email_verified を true に設定することで、検証プロセスをスキップ
                        { Name: 'email_verified', Value: 'true' }, 
                        { Name: 'custom:name', Value: name },
                    ],
                    MessageAction: 'SUPPRESS', // 招待メールなどを抑制
                });
                await cognitoClient.send(createUserCommand);
                
                // 2. ユーザーを Admin グループに追加 (選択式)
                if (addToAdminGroup) {
                    const groupName = 'Admin'; // 大文字の 'Admin' グループ名を使用
                    const addGroupCommand = new AdminAddUserToGroupCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: cognitoUsername,
                        GroupName: groupName,
                    });
                    await cognitoClient.send(addGroupCommand);
                    console.log(`✅ User ${cognitoUsername} created and added to ${groupName} group.`);
                } else {
                    console.log(`✅ User ${cognitoUsername} created as standard user.`);
                }

                return {
                    statusCode: 201,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: `User ${cognitoUsername} created successfully.` }),
                };

            // ユーザー一覧取得 (GET /users)
            case 'GET':
                const listUsersCommand = new ListUsersCommand({
                    UserPoolId: USER_POOL_ID,
                });
                const response = await cognitoClient.send(listUsersCommand);

                const usersData: UserData[] = (response.Users || []).map(mapCognitoUserToUserData);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify(usersData),
                };

            // ユーザー属性更新 (PUT /users/{username})
            case 'PUT':
                // ユーザー名はパスパラメータから取得
                const targetUsername = usernameParam; 

                if (!targetUsername) throw new Error('Username path parameter is missing.');
                if (!body) throw new Error('Request body is missing.');
                
                const updateData = JSON.parse(body);
                const { email: updatedEmail, name: updatedName } = updateData;

                const updateAttributes: AttributeType[] = [];
                // emailは必須属性のため、更新する場合は含める
                if (updatedEmail) updateAttributes.push({ Name: 'email', Value: updatedEmail });
                if (updatedName) updateAttributes.push({ Name: 'custom:name', Value: updatedName });

                if (updateAttributes.length > 0) {
                    const updateCommand = new AdminUpdateUserAttributesCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: targetUsername,
                        UserAttributes: updateAttributes,
                    });
                    await cognitoClient.send(updateCommand);
                }
                
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: `User ${targetUsername} updated successfully.` }),
                };

            // ユーザー削除 (DELETE /users/{username})
            case 'DELETE':
                // ユーザー名はパスパラメータから取得
                const deleteUsername = usernameParam;

                if (!deleteUsername) throw new Error('Username path parameter is missing.');

                const deleteCommand = new AdminDeleteUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: deleteUsername,
                });
                await cognitoClient.send(deleteCommand);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: `User ${deleteUsername} deleted successfully.` }),
                };

            default:
                return {
                    statusCode: 405,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'Method Not Allowed' }),
                };
        }
    } catch (error) {
        console.error('Lambda execution error:', error);
        
        // エラー詳細を抽出してクライアントに返す
        return {
            statusCode: 400, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ message: (error as Error).message || 'An unknown error occurred.' }),
        };
    }
};
