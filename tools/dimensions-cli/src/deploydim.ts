import * as fs from 'fs';
import * as path from 'path';
import { DimConfig } from './config';
import { ReleaseFile } from './manifest';

/**
 * 產生 DEPLOY.DIM —— 搬檔到編譯機的指令文件。
 *
 * 格式（7 欄 CSV，沿用 SKILL 定義）：
 *   "變更狀態","DIM主機IP","DIM路徑","檔名","編譯機IP","編譯機路徑","檔名"
 *
 * - 變更狀態：統一 MOD（含新增檔，依先前確認）
 * - DIM路徑：workarea 中該檔案的「資料夾路徑」（不含檔名）
 * - 編譯機路徑：依環境類型轉換（Windows / K8S）
 *
 * 對象：這次「異動 + 新增」的所有檔案（modified + added）。
 *
 * 編譯機路徑規則（SKILL 確認）：
 *   Windows： D:\{VOB_NAME}\{VOB之後的相對路徑}
 *   K8S ： root\K8S\{VOB_NAME}\{VOB之後的相對路徑}
 *   兩者相對路徑與 DIM 路徑相同，只有根目錄不同。
 */

/** DEPLOY.DIM 一行（一個檔案）需要的資訊 */
interface DeployEntry {
  /** workarea 中的資料夾路徑（不含檔名），對應 DIM路徑欄 */
  dimDir: string;
  /** 檔名 */
  fileName: string;
  /** 編譯機資料夾路徑（不含檔名） */
  buildDir: string;
}

/**
 * 把 workarea 完整路徑拆成 DIM 資料夾路徑 + 檔名，
 * 並算出編譯機資料夾路徑。
 */
function toDeployEntry(workareaPath: string, config: DimConfig): DeployEntry {
  const dimDir = path.win32.dirname(workareaPath);
  const fileName = path.win32.basename(workareaPath);

  // VOB 之後的相對路徑：把 workareaRoot 去掉
  // workareaRoot 例：D:\Dimensions\MYVOB  →  rel 例：MyFrontendCode\src\components
  const relFromVob = path.win32.relative(config.workareaRoot, dimDir);

  // 編譯機根目錄依環境類型
  let buildDir: string;
  if (config.buildEnv === 'K8S') {
    // opt\K8S\{VOB_NAME}\{rel}
    buildDir = ['opt', 'K8S', config.vobName, relFromVob].join('\\');
  } else {
    // Windows： D:\{VOB_NAME}\{rel}
    buildDir = `D:\\${config.vobName}\\${relFromVob}`;
  }

  return { dimDir, fileName, buildDir };
}

/** CSV 欄位加引號 */
function q(v: string): string {
  return `"${v}"`;
}

/**
 * 產生 DEPLOY.DIM 內容字串。
 * @param files 這次異動+新增的所有檔案
 */
export function buildDeployDimContent(files: ReleaseFile[], config: DimConfig): string {
  const lines = files.map(f => {
    const e = toDeployEntry(f.workareaPath, config);
    return [
      q('MOD'),                  // 變更狀態統一 MOD
      q(config.dimHostIp),       // DIM 主機 IP
      q(e.dimDir),               // DIM 路徑
      q(e.fileName),             // 檔名
      q(config.buildHostIp),     // 編譯機 IP
      q(e.buildDir),             // 編譯機路徑
      q(e.fileName),             // 檔名
    ].join(',');
  });
  return lines.join('\r\n') + '\r\n';
}

/**
 * 產生 DEPLOY.DIM 並寫到 workarea 的 VOB 根目錄（MYVOB/DEPLOY.DIM）。
 * 回傳寫出的完整路徑。
 */
export function writeDeployDim(files: ReleaseFile[], config: DimConfig): string {
  const content = buildDeployDimContent(files, config);
  const deployPath = path.win32.join(config.workareaRoot, 'DEPLOY.DIM');

  // 注意：在非 Windows 環境（如本機測試）path.win32 只組字串，
  // 實際寫檔用 fs，路徑分隔符在 Windows 上才正確。
  fs.mkdirSync(path.dirname(deployPath), { recursive: true });
  fs.writeFileSync(deployPath, content, 'utf-8');
  return deployPath;
}
