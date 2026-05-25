import axios, { AxiosInstance } from 'axios';
import { BitbucketConfig } from './config';

/**
 * Bitbucket Server 的 changes API 回傳項目
 * 參考：GET /rest/api/1.0/projects/{projectKey}/repos/{repositorySlug}/compare/changes
 */
export interface BitbucketChange {
  path: {
    toString: string;
  };
  srcPath?: {
    toString: string;
  };
  type: 'ADD' | 'MODIFY' | 'DELETE' | 'RENAME' | 'COPY' | 'MOVE';
  nodeType?: string;
}

interface ChangesResponse {
  values: BitbucketChange[];
  size: number;
  isLastPage: boolean;
  nextPageStart?: number;
}

export class BitbucketClient {
  private http: AxiosInstance;
  private projectKey: string;

  constructor(config: BitbucketConfig) {
    this.projectKey = config.projectKey;
    this.http = axios.create({
      baseURL: config.baseUrl,
      auth: {
        username: config.username,
        password: config.password,
      },
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  /**
   * 比對兩個 ref 之間的檔案變更
   * @param repoSlug repo 名稱
   * @param fromRef 來源 ref（例如 release/20260523）
   * @param toRef 目標 ref（例如 master）
   *
   * 注意：Bitbucket Server compare/changes API 回傳的是
   *   「from 相對於 to 的變更」
   * 所以要查「master → release 的變更」，要設定：
   *   from = release分支, to = master
   */
  async getChanges(repoSlug: string, fromRef: string, toRef: string): Promise<BitbucketChange[]> {
    const allChanges: BitbucketChange[] = [];
    let start = 0;
    const limit = 1000;

    while (true) {
      const url = `/rest/api/1.0/projects/${this.projectKey}/repos/${repoSlug}/compare/changes`;
      const response = await this.http.get<ChangesResponse>(url, {
        params: {
          from: fromRef,
          to: toRef,
          start,
          limit,
        },
      });

      const data = response.data;
      allChanges.push(...data.values);

      if (data.isLastPage || data.nextPageStart === undefined) {
        break;
      }
      start = data.nextPageStart;
    }

    return allChanges;
  }

  /**
   * 檢查 ref 是否存在
   */
  async branchExists(repoSlug: string, branchName: string): Promise<boolean> {
    try {
      const url = `/rest/api/1.0/projects/${this.projectKey}/repos/${repoSlug}/branches`;
      const response = await this.http.get(url, {
        params: { filterText: branchName, limit: 100 },
      });
      const branches = response.data.values || [];
      // displayId 是分支名稱（不含 refs/heads/ 前綴）
      return branches.some((b: any) => b.displayId === branchName);
    } catch {
      return false;
    }
  }
}
