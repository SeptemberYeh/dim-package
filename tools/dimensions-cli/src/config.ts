import * as fs from 'fs';
import * as path from 'path';

export interface DimConfig {
  // ── 連線 ──
  dmcliPath: string;
  username: string;
  host: string;
  dbname: string;
  dsn: string;

  // ── Dimensions 操作 ──
  /** request 單號（/CHANGE_DOC_IDS） */
  requestId: string;
  /** project/stream（/WORKSET） */
  workset: string;
  /** checkin/deliver 註解（通常是 release 分支名稱） */
  comment: string;
  /** 變更狀態目標（AC /STATUS） */
  targetStatus: string;
  /** relate 關聯類型 */
  relateType: 'IN_RESPONSE_TO' | 'AFFECTED' | 'INFO';
  /** CI（deliver）必填的 part-spec */
  partSpec: string;
  /** CI（deliver）選用的 /FORMAT */
  defaultFormat?: string;
  /** /FILENAME 定位格式（需實測） */
  filenameMode: 'relative' | 'basename' | 'repoPath';

  // ── 路徑 ──
  /** workarea 根目錄（= VOB 根，DEPLOY.DIM 放這裡） */
  workareaRoot: string;
  /** export 工具產出的資料夾（含 manifest.json） */
  exportDir: string;

  // ── DEPLOY.DIM ──
  /** VOB 名稱（編譯機路徑用） */
  vobName: string;
  /** DIM 主機 IP（DEPLOY.DIM 欄位） */
  dimHostIp: string;
  /** 編譯機 IP（DEPLOY.DIM 欄位） */
  buildHostIp: string;
  /** 編譯機環境：windows | K8S（決定編譯機路徑格式） */
  buildEnv: 'windows' | 'K8S';
}

export function loadConfig(configPath: string = 'dim-config.json'): DimConfig {
  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `設定檔不存在：${absolutePath}\n請複製 dim-config.example.json 為 dim-config.json 並填入設定`
    );
  }
  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const config = JSON.parse(raw) as DimConfig;

  // 預設值
  if (!config.relateType) config.relateType = 'IN_RESPONSE_TO';
  if (!config.filenameMode) config.filenameMode = 'relative';
  if (!config.buildEnv) config.buildEnv = 'windows';

  const required: (keyof DimConfig)[] = [
    'dmcliPath', 'username', 'host', 'dbname', 'dsn',
    'requestId', 'workset', 'comment', 'targetStatus', 'partSpec',
    'workareaRoot', 'exportDir',
    'vobName', 'dimHostIp', 'buildHostIp',
  ];
  for (const key of required) {
    if (!config[key]) throw new Error(`設定檔缺少必填欄位：${key}`);
  }
  return config;
}
