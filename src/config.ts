import * as fs from 'fs';
import * as path from 'path';

export interface BitbucketConfig {
  baseUrl: string;
  username: string;
  password: string;
  projectKey: string;
}

export interface AppConfig {
  bitbucket: BitbucketConfig;
  repos: string[];
  baseBranch: string;
}

export function loadConfig(configPath: string = 'config.json'): AppConfig {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `設定檔不存在：${absolutePath}\n` +
      `請複製 config.example.json 為 config.json 並填入正確的設定值`
    );
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const config = JSON.parse(raw) as AppConfig;

  // 基本驗證
  if (!config.bitbucket?.baseUrl) throw new Error('config.bitbucket.baseUrl 未設定');
  if (!config.bitbucket?.username) throw new Error('config.bitbucket.username 未設定');
  if (!config.bitbucket?.password) throw new Error('config.bitbucket.password 未設定');
  if (!config.bitbucket?.projectKey) throw new Error('config.bitbucket.projectKey 未設定');
  if (!config.repos?.length) throw new Error('config.repos 必須至少包含一個 repo');
  if (!config.baseBranch) config.baseBranch = 'master';

  return config;
}
