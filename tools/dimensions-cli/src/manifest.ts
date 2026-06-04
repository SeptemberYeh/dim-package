import * as fs from 'fs';
import * as path from 'path';
import { DimConfig } from './config';
import { DimFile } from './commands';

/**
 * release-diff-cli export 產出的 manifest.json：
 *   files: [{ repo, filePath, category(M|A|R_NEW|...), status(ok|failed) }]
 */
export interface ManifestEntry {
  repo: string;
  filePath: string;
  category: string;
  status: string;
}

/** 一個 release 檔案（含 workarea 路徑與 DimFile 定位資訊） */
export interface ReleaseFile {
  repo: string;
  filePath: string;
  workareaPath: string;
  category: string;
  dim: DimFile;
}

export interface CategorizedFiles {
  /** 修改檔（含 DEPLOY.DIM）→ relate + checkout + checkin */
  modified: ReleaseFile[];
  /** 新增檔（含 R_NEW）→ deliver */
  added: ReleaseFile[];
}

/** 依 filenameMode 算出 /FILENAME 的值 */
function fileNameValue(repo: string, filePath: string, config: DimConfig): string {
  switch (config.filenameMode) {
    case 'basename':
      return filePath.split('/').pop() || filePath;
    case 'repoPath':
      return `${repo}/${filePath}`;
    case 'relative':
    default:
      return filePath;
  }
}

/** 建一個 ReleaseFile */
function makeReleaseFile(repo: string, filePath: string, category: string, config: DimConfig): ReleaseFile {
  const workareaPath = path.win32.join(config.workareaRoot, repo, filePath.split('/').join(path.win32.sep));
  const productId = config.workset.split(':')[0] || 'PRODUCT';
  return {
    repo,
    filePath,
    workareaPath,
    category,
    dim: {
      productPrefix: `${productId}:`,
      fileNameValue: fileNameValue(repo, filePath, config),
      workareaPath,
    },
  };
}

/**
 * 讀 manifest，分成 modified（M）與 added（A + R_NEW）。
 * 注意：DEPLOY.DIM 不在這裡加入，由呼叫端在產生 DEPLOY.DIM 後補進 modified。
 */
export function loadAndCategorize(config: DimConfig): CategorizedFiles {
  const manifestPath = path.join(config.exportDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`找不到 manifest.json：${manifestPath}\n請先用 release-diff-cli 的 export 指令產出檔案`);
  }
  const raw = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(raw) as { files: ManifestEntry[] };
  const okFiles = manifest.files.filter(f => f.status === 'ok');

  const modified = okFiles
    .filter(f => f.category === 'M')
    .map(f => makeReleaseFile(f.repo, f.filePath, f.category, config));

  const added = okFiles
    .filter(f => f.category === 'A' || f.category === 'R_NEW')
    .map(f => makeReleaseFile(f.repo, f.filePath, f.category, config));

  return { modified, added };
}

/**
 * 把 export 出來的檔案覆蓋到 workarea。
 * 來源：{exportDir}/{repo}/{相對路徑}
 */
export function copyToWorkarea(files: ReleaseFile[], config: DimConfig): void {
  for (const f of files) {
    const src = path.join(config.exportDir, f.repo, f.filePath.split('/').join(path.sep));
    fs.mkdirSync(path.dirname(f.workareaPath), { recursive: true });
    fs.copyFileSync(src, f.workareaPath);
  }
}

/**
 * 為 DEPLOY.DIM 建一個 ReleaseFile（歸入 modified）。
 * DEPLOY.DIM 在 VOB 根目錄，product 前綴與其他檔相同。
 */
export function makeDeployDimFile(deployPath: string, config: DimConfig): ReleaseFile {
  const productId = config.workset.split(':')[0] || 'PRODUCT';
  // /FILENAME 用 DEPLOY.DIM（在 VOB 根，相對路徑即檔名本身）
  return {
    repo: '(VOB root)',
    filePath: 'DEPLOY.DIM',
    workareaPath: deployPath,
    category: 'M',
    dim: {
      productPrefix: `${productId}:`,
      fileNameValue: 'DEPLOY.DIM',
      workareaPath: deployPath,
    },
  };
}
