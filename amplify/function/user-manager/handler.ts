import { 
    CognitoIdentityProviderClient, 
    ListUsersCommand, 
    AdminDeleteUserCommand, 
    AdminUpdateUserAttributesCommand,
    AdminCreateUserCommand,
    AdminAddUserToGroupCommand,
    AdminListGroupsForUserCommand, 
    AdminRemoveUserFromGroupCommand, 
    AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// 環境変数からUserPool IDを取得。TS2580エラー回避のためglobalThisを使用
const USER_POOL_ID = (globalThis as any).process.env.USER_POOL_ID;
const cognitoClient = new CognitoIdentityProviderClient({});

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
};

// ユーザーデータの形式を統一
interface UserData {
    username: string;
    email?: string;
    name?: string;
    depart?: string;
    status?: string;
    enabled?: boolean;
    createdAt?: Date;
    groups: string[];
}

/**
 * Cognitoユーザー属性を整形してUserData形式に変換するヘルパー関数
 */
const mapCognitoUserToUserData = (user: any, groups: string[] = []): UserData => {
    const attributesMap = user.Attributes?.reduce((acc: any, attr: AttributeType) => {
        if (attr.Name && attr.Value) {
            acc[attr.Name] = attr.Value;
        }
        return acc;
    }, {});
    
    return {
        username: user.Username, 
        email: attributesMap?.email,
        name: attributesMap?.['custom:namex'],
        depart: attributesMap?.['custom:department'],
        status: user.UserStatus,
        enabled: user.Enabled,
        createdAt: user.UserCreateDate,
        groups: groups, 
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
    const usernameParam = pathParameters?.id; 

    try {
        switch (httpMethod) {
            
            case 'OPTIONS':
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: 'CORS Preflight Success' }),
                };

            // 新規ユーザー作成 (POST /users)
            case 'POST':
                if (!body) throw new Error('Request body is missing.');
                
                const createData = JSON.parse(body);
                const { 
                    password, 
                    email, 
                    name, 
                    depart, 
                    addToAdminGroup, 
                    addToCreatingBotAllowedGroup, 
                    addToPublishAllowedGroup 
                } = createData; 
                
                const cognitoUsername = email;

                if (!cognitoUsername || !password || !email || !name) {
                    throw new Error('Missing required fields: password, email, or name.');
                }

                // 1. ユーザー作成
                const createUserCommand = new AdminCreateUserCommand({
                    UserPoolId: USER_POOL_ID,
                    Username: cognitoUsername, 
                    TemporaryPassword: password,
                    UserAttributes: [
                        { Name: 'email', Value: email },
                        { Name: 'email_verified', Value: 'true' }, 
                        { Name: 'custom:namex', Value: name },
                        { Name: 'custom:department', Value: depart || '' }, // 部署名
                    ],
                    MessageAction: 'SUPPRESS', 
                });
                await cognitoClient.send(createUserCommand);
                
                // 2. ユーザーをグループに追加
                const groupsToAdd: string[] = [];
                if (addToAdminGroup) groupsToAdd.push('Admin');
                if (addToCreatingBotAllowedGroup) groupsToAdd.push('CreatingBotAllowed');
                if (addToPublishAllowedGroup) groupsToAdd.push('PublishAllowed');

                if (groupsToAdd.length > 0) {
                    for (const groupName of groupsToAdd) {
                        const addGroupCommand = new AdminAddUserToGroupCommand({
                            UserPoolId: USER_POOL_ID,
                            Username: cognitoUsername,
                            GroupName: groupName,
                        });
                        await cognitoClient.send(addGroupCommand);
                    }
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
                const listUsersResponse = await cognitoClient.send(listUsersCommand);

                // ユーザーごとにグループ情報を問い合わせる (N+1クエリ)
                const usersDataPromises = (listUsersResponse.Users || []).map(async (user) => {
                    const listGroupsCommand = new AdminListGroupsForUserCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: user.Username,
                    });
                    const groupsResponse = await cognitoClient.send(listGroupsCommand);
                    
                    const groupNames = (groupsResponse.Groups || [])
                        .map(group => group.GroupName)
                        .filter((name): name is string => !!name);

                    return mapCognitoUserToUserData(user, groupNames);
                });

                const usersData: UserData[] = await Promise.all(usersDataPromises);

                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify(usersData),
                };

            // ユーザー属性更新 (PUT /users/{username})
            case 'PUT':
                const targetUsername = usernameParam; 

                if (!targetUsername) throw new Error('Username path parameter is missing.');
                if (!body) throw new Error('Request body is missing.');
                
                const updateData = JSON.parse(body);
                const { 
                    email: updatedEmail, 
                    name: updatedName, 
                    depart: updatedDepart,
                    groupsToSet, // 設定したいグループのリスト
                } = updateData;

                // --- 1. 属性更新 ---
                const updateAttributes: AttributeType[] = [];
                // Emailの更新は必須ではないが、リクエストに含まれている場合は更新
                if (updatedEmail) updateAttributes.push({ Name: 'email', Value: updatedEmail });
                if (updatedName){
		       	updateAttributes.push({ Name: 'custom:namex', Value: updatedName });
		}
                if (updatedDepart){
		       	updateAttributes.push({ Name: 'custom:department', Value: updatedDepart });
		}

                if (updateAttributes.length > 0) {
                    const updateCommand = new AdminUpdateUserAttributesCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: targetUsername,
                        UserAttributes: updateAttributes,
                    });
                    await cognitoClient.send(updateCommand);
                }

                // --- 2. グループ更新 ---
                if (Array.isArray(groupsToSet)) {
                    // 2.1. 現在のグループを取得
                    const currentGroupsResponse = await cognitoClient.send(new AdminListGroupsForUserCommand({
                        UserPoolId: USER_POOL_ID,
                        Username: targetUsername,
                    }));
                    const currentGroups = (currentGroupsResponse.Groups || [])
                        .map(g => g.GroupName)
                        .filter((name): name is string => !!name);

                    // 2.2. 追加すべきグループと削除すべきグループを計算
                    const groupsToAdd = groupsToSet.filter((g: string) => !currentGroups.includes(g));
                    const groupsToRemove = currentGroups.filter((g: string) => !groupsToSet.includes(g));

                    // 2.3. グループ追加の実行
                    for (const groupName of groupsToAdd) {
                        await cognitoClient.send(new AdminAddUserToGroupCommand({
                            UserPoolId: USER_POOL_ID,
                            Username: targetUsername,
                            GroupName: groupName,
                        }));
                    }

                    // 2.4. グループ削除の実行
                    for (const groupName of groupsToRemove) {
                        await cognitoClient.send(new AdminRemoveUserFromGroupCommand({
                            UserPoolId: USER_POOL_ID,
                            Username: targetUsername,
                            GroupName: groupName,
                        }));
                    }
                }
                
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({ message: `User ${targetUsername} updated successfully.` }),
                };

            // ユーザー削除 (DELETE /users/{username})
            case 'DELETE':
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
        
        return {
            statusCode: 400, 
            headers: CORS_HEADERS, 
            body: JSON.stringify({ message: (error as Error).message || 'An unknown error occurred.' }),
        };
    }
};

