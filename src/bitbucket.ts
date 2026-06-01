import axios, { AxiosInstance } from 'axios';
import { BitbucketConfig } from './config';

/**
 * Bitbucket Server 的 changes API 回傳項目
 * 參考：GET /rest/api/1.0/projects/{projectKey}/repos/{repositorySlug}/changes
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
   * @param sinceRef 起點 ref（基準，例如 master）
   * @param untilRef 終點 ref（要上線的，例如 release/20260523）
   *
   * 語義對應 git diff A B：
   *   since = A（起點，master）
   *   until = B（終點，release 分支）
   *
   * 即「從 master 到 release 分支多了哪些變更」
   *
   * 若 ref 不存在，API 會回 404，呼叫端應 catch 處理
   */
  async getChanges(repoSlug: string, sinceRef: string, untilRef: string): Promise<BitbucketChange[]> {
    const allChanges: BitbucketChange[] = [];
    let start = 0;
    const limit = 1000;

    while (true) {
      const url = `/rest/api/1.0/projects/${this.projectKey}/repos/${repoSlug}/changes`;
      const response = await this.http.get<ChangesResponse>(url, {
        params: {
          since: sinceRef,
          until: untilRef,
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
   * 抓取指定 ref 上某個檔案的原始內容（位元組）
   * @param repoSlug repo 名稱
   * @param filePath 檔案路徑（repo 內相對路徑）
   * @param atRef 要抓取的 ref（例如 release/20260523）
   *
   * 使用 raw API：
   *   GET /rest/api/1.0/projects/{key}/repos/{slug}/raw/{path}?at={ref}
   *
   * 以 arraybuffer 取得，保留原始 bytes（避免二進位檔被文字編碼破壞）
   */
  async getRawFile(repoSlug: string, filePath: string, atRef: string): Promise<Buffer> {
    // path 可能含多層目錄，需逐段編碼但保留斜線
    const encodedPath = filePath
      .split('/')
      .map(seg => encodeURIComponent(seg))
      .join('/');

    const url = `/rest/api/1.0/projects/${this.projectKey}/repos/${repoSlug}/raw/${encodedPath}`;
    const response = await this.http.get(url, {
      params: { at: atRef },
      responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
  }
}
