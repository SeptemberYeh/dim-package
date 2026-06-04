import { spawnSync } from 'child_process';

/**
 * dmcli 呼叫封裝
 *
 * 連線與跳脫規則來自 Dimensions CM 14.3.2 Command-Line Reference（已確認的文件原文）：
 *
 * 連線語法（p.21-22）：
 *   dmcli -user <帳號> -pass <密碼> -host <host> -dbname <db> -dsn <dsn> -cmd "<指令>"
 *
 *   原本用 -con <連線名稱> 會讀 GUI 存的連線設定，但若該設定未存帳密，
 *   dmcli 會跳視窗要求手動輸入。改用完整參數直接帶帳密，避免跳登入視窗。
 *
 * Windows 跳脫規則（p.17）：
 *   -cmd 內每個包字串用的雙引號，都要用反斜線跳脫：\"
 *   例：dmcli -cmd "CI \"PROD:FILE.A-SRC;1\" /DESCRIPTION=\"test\""
 *
 *   含引號字串若還要再包引號（巢狀），Windows 需前後各三個雙引號：
 *   例：dmcli -con _x -cmd "EI """PROD:TEST TXT.SRC""" /USER_FILENAME=..."
 */

export interface DmcliConnection {
  /** 帳號 */
  username: string;
  /** 密碼 */
  password: string;
  /** Dimensions 主機 */
  host: string;
  /** 資料庫名稱 */
  dbname: string;
  /** DSN（資料庫連線名稱） */
  dsn: string;
  /** dmcli.exe 完整路徑 */
  dmcliPath: string;
}

export interface DmcliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  command: string; // 實際執行的 Dimensions 指令（供記錄）
  error?: string;
}

/**
 * 將一個值用雙引號包起來，並依 Windows -cmd 規則跳脫。
 * 用於 item-spec、路徑等含空白或特殊字元的值。
 *
 * 例：quote('PROD:TEST TXT.A-SRC;1') => \"PROD:TEST TXT.A-SRC;1\"
 */
export function quoteArg(value: string): string {
  return `\\"${value}\\"`;
}

/**
 * 執行單一 Dimensions 指令。
 *
 * @param conn 連線資訊
 * @param dmCommand 完整的 Dimensions 指令字串（例如 'EI "PROD:..." /WORKSET=...'）
 *                  注意：指令內若有需要包字串的地方，呼叫端應已用 quoteArg 處理好跳脫
 * @param timeoutMs 逾時毫秒
 */
export function runDmCommand(
  conn: DmcliConnection,
  dmCommand: string,
  timeoutMs = 60000
): DmcliResult {
  const args = [
    '-user', conn.username,
    '-pass', conn.password,
    '-host', conn.host,
    '-dbname', conn.dbname,
    '-dsn', conn.dsn,
    '-cmd', dmCommand,
  ];

  try {
    const result = spawnSync(conn.dmcliPath, args, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      windowsHide: true,
    });

    // dmcli 的成功/失敗判斷：
    // 文件範例顯示輸出含 "(SUCCESS)" 或 "Operation completed"。
    // exit code 不一定可靠，所以同時檢查 stdout 關鍵字。
    // TODO[驗證]：請確認你環境中 dmcli 成功時的實際 exit code 與輸出字樣，
    //            必要時調整下方判斷邏輯。
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const looksSuccess =
      result.status === 0 ||
      /\(SUCCESS\)/i.test(stdout) ||
      /Operation completed/i.test(stdout);
    const looksError =
      /\(FAILURE\)/i.test(stdout) ||
      /\bERROR\b/i.test(stdout) ||
      /\bERROR\b/i.test(stderr);

    return {
      ok: looksSuccess && !looksError,
      stdout,
      stderr,
      exitCode: result.status,
      command: dmCommand,
      error: result.error?.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      command: dmCommand,
      error: err.message || String(err),
    };
  }
}

/**
 * 測試連線：執行一個無副作用的指令確認能登入。
 * 這裡用 SCWS（Set Current Project）或改用你慣用的查詢指令。
 * TODO[驗證]：選一個你環境中保證存在、且無副作用的指令來測連線，
 *            例如 LWS（List Projects）。預設用 LWS。
 */
export function testConnection(conn: DmcliConnection): DmcliResult {
  return runDmCommand(conn, 'LWS');
}
