import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 嘗試定位 dmcli 執行檔。
 *
 * 策略（依序嘗試）：
 *  1. 環境變數 DM_ROOT / DIMENSIONS 下的 bin
 *  2. 常見的安裝路徑（Serena/Micro Focus/OpenText 各版本命名都試）
 *  3. PATH 中直接呼叫 dmcli
 *
 * 注意：dmcli 的實際安裝路徑因版本與安裝設定而異，
 * 以下清單是「常見預設值」，不保證涵蓋你的環境。
 * 若都找不到，工具會請使用者手動指定路徑。
 */

const EXE = 'dmcli.exe';

// 常見安裝根目錄（會在其後再接 \bin\dmcli.exe 嘗試）
const COMMON_ROOTS = [
  'C:\\Program Files\\Serena\\Dimensions',
  'C:\\Program Files (x86)\\Serena\\Dimensions',
  'C:\\Program Files\\Micro Focus\\Dimensions',
  'C:\\Program Files (x86)\\Micro Focus\\Dimensions',
  'C:\\Program Files\\OpenText\\Dimensions',
  'C:\\Program Files (x86)\\OpenText\\Dimensions',
];

export interface LocateResult {
  found: boolean;
  path?: string;
  source: string; // 說明是從哪裡找到的
  candidates: string[]; // 所有檢查過的路徑（供除錯）
}

/**
 * 在一個根目錄底下，嘗試找出 client 子目錄裡的 dmcli.exe
 * Dimensions 安裝路徑常見形如：
 *   {root}\{version}\Prog\dmcli.exe
 *   {root}\CM\Prog\dmcli.exe
 *   {root}\bin\dmcli.exe
 */
function findUnderRoot(root: string): string[] {
  const hits: string[] = [];
  if (!fs.existsSync(root)) return hits;

  // 直接子路徑
  const directCandidates = [
    path.join(root, 'Prog', EXE),
    path.join(root, 'bin', EXE),
    path.join(root, EXE),
  ];
  for (const c of directCandidates) {
    if (fs.existsSync(c)) hits.push(c);
  }

  // 帶版本號的子目錄：{root}\{version}\Prog\dmcli.exe
  try {
    const subdirs = fs.readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
    for (const sub of subdirs) {
      const c = path.join(root, sub, 'Prog', EXE);
      if (fs.existsSync(c)) hits.push(c);
      const c2 = path.join(root, sub, 'bin', EXE);
      if (fs.existsSync(c2)) hits.push(c2);
    }
  } catch {
    // 讀目錄失敗就略過
  }

  return hits;
}

export function locateDmcli(userProvidedPath?: string): LocateResult {
  const candidates: string[] = [];

  // 0. 使用者手動指定
  if (userProvidedPath) {
    candidates.push(userProvidedPath);
    if (fs.existsSync(userProvidedPath)) {
      return { found: true, path: userProvidedPath, source: '使用者指定', candidates };
    }
  }

  // 1. 環境變數
  const envRoots = [process.env.DM_ROOT, process.env.DIMENSIONS, process.env.DMROOT]
    .filter((v): v is string => !!v);
  for (const root of envRoots) {
    const hits = findUnderRoot(root);
    candidates.push(...hits);
    if (hits.length > 0) {
      return { found: true, path: hits[0], source: `環境變數 (${root})`, candidates };
    }
  }

  // 2. 常見安裝路徑
  for (const root of COMMON_ROOTS) {
    const hits = findUnderRoot(root);
    candidates.push(...hits);
    if (hits.length > 0) {
      return { found: true, path: hits[0], source: `常見安裝路徑`, candidates };
    }
  }

  // 3. PATH 中直接呼叫（用 where 命令）
  try {
    const out = execFileSync('where', [EXE], { encoding: 'utf-8' }).trim();
    const firstLine = out.split(/\r?\n/)[0];
    if (firstLine) {
      candidates.push(firstLine);
      return { found: true, path: firstLine, source: 'PATH 環境變數', candidates };
    }
  } catch {
    // where 找不到會丟錯，略過
  }

  return { found: false, source: '全部嘗試失敗', candidates };
}
