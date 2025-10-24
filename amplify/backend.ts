import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource.js';
import { userManager } from './function/user-manager/resource.js';
import * as cdk from 'aws-cdk-lib';
import { RestApi, LambdaIntegration, AuthorizationType, CognitoUserPoolsAuthorizer } from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';

const backend = defineBackend({
    auth,
    userManager,
});

const apiStack = backend.createStack('ApiStack');
const userPool = backend.auth.resources.userPool;

// 1. Lambdaリソースの取得とFunction型へのキャスト
const userManagerLambda = backend.userManager.resources.lambda as Function;

// 2. LambdaにUserPool IDを環境変数として渡す
userManagerLambda.addEnvironment(
    'USER_POOL_ID',
    userPool.userPoolId
);

// 3. LambdaにCognito IDPへの権限を付与 (CDKのIAM Policyを使用)
const userPoolArn = userPool.userPoolArn;

userManagerLambda.role?.attachInlinePolicy( 
    new iam.Policy(apiStack, 'CognitoAdminAccessPolicy', {
        statements: [
            new iam.PolicyStatement({
                actions: [
                    'cognito-idp:AdminListGroupsForUser',
                    'cognito-idp:ListUsers',
                    'cognito-idp:AdminUpdateUserAttributes',
                    'cognito-idp:AdminCreateUser', // 💡 AdminCreateUserCommand
                    'cognito-idp:AdminAddUserToGroup', // 💡 AdminAddUserToGroupCommand
                    'cognito-idp:AdminDeleteUser', 
                ],
                resources: [userPoolArn],
            }),
        ],
    })
);

// 4. API Gatewayの設定
const userManagerApi = new RestApi(apiStack, 'UserManagerApi', {
    restApiName: 'UserManagerService',
    deployOptions: {
        stageName: 'prod',
    },
    // 💡 [CORS修正]: defaultCorsPreflightOptions を使用し、CORS設定をAPI全体に自動適用
    defaultCorsPreflightOptions: {
        allowOrigins: [
            'http://localhost:3000', 
            'http://192.168.49.241:3000',
            // 💡 AWSクラウドデプロイ用（最も重要）
            'https://master.d36nkyvt6gwphx.amplifyapp.com',
            // 💡 念のため、ワイルドカードドメインも追加（推奨されませんが、もしブランチが増える場合は有効）
            'https://*.amplifyapp.com', 
        ], 
        //allowMethods: ['GET', 'PUT', 'DELETE', 'POST', 'OPTIONS'],
        allowMethods: ['GET', 'PUT', 'DELETE', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
    },
});

// Cognito Authorizerの作成
const authorizer = new CognitoUserPoolsAuthorizer(apiStack, 'CognitoAuthorizer', {
    cognitoUserPools: [userPool], // 💡 [重要]: Cognitoユーザープールを正しく参照しているか
    identitySource: 'method.request.header.Authorization', // 💡 [確認]: Bearerトークンを受け取る設定
});

// 標準の Lambda 統合 (GET/PUT/DELETE/POST のメイン処理用)
const userManagerIntegration = new LambdaIntegration(userManagerLambda);

// ----------------------------------------------------
// メソッドオプション (adminMethods)
// ----------------------------------------------------
const adminMethods = {
    authorizationType: AuthorizationType.COGNITO,
    authorizer,
    
    methodResponses: [
        {
            // 成功時 (200 OK)
            statusCode: '200',
            responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true, },
        },
        {
            // 認証失敗時 (401 Unauthorized)
            statusCode: '401',
            responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true, },
        },
    ],
    requestParameters: {
        'method.request.header.Authorization': true,
    },
};

// ----------------------------------------------------
// リソースとメソッドの設定
// ----------------------------------------------------
const usersResource = userManagerApi.root.addResource('users');
const userResource = usersResource.addResource('{id}');

// 💡 [修正1]: GET /users にも Authorizer を適用し、adminMethodsを使用 (Adminユーザーのみ一覧取得可能)
usersResource.addMethod('GET', userManagerIntegration, adminMethods);

// 💡 [修正2]: POST /users (新規作成) を usersResource に正しく紐づけ
usersResource.addMethod('POST', userManagerIntegration, adminMethods);

// PUT /users/{id} の定義 (個別のユーザー操作には {id} が必要)
userResource.addMethod('PUT', userManagerIntegration, adminMethods); 

// DELETE /users/{id} の定義
userResource.addMethod('DELETE', userManagerIntegration, adminMethods); 


// バックエンドのアウトプットとしてAPI URLを露出
backend.addOutput({
    custom: {
        API: {
            UserManagerApi: {
                endpoint: userManagerApi.url,
                region: apiStack.region,
            }
        }
    }
});
