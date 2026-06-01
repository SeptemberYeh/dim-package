import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { BitbucketClient } from './bitbucket';
import { ClassifiedChange } from './diff';

export interface ExportResult {
  repo: string;
  filePath: string;
  category: string;
  status: 'ok' | 'failed';
  error?: string;
}

/**
 * 匯出實際有異動的檔案內容到本地資料夾。
 *
 * 匯出對象：needRelate || needDeliver 的檔案
 *   = Modified (M) + Added (A) + Renamed 新檔 (R_NEW)
 * 不含：Renamed 舊檔 (R_OLD)、Deleted (D)
 *
 * 輸出結構（保留 repo 與目錄層級）：
 *   {outputDir}/{repo}/{原始相對路徑}
 *
 * 例：
 *   export-20260523/MyFrontendCode/src/components/Button.vue
 *   export-20260523/MyBackendCode/src/main/java/com/example/Service.java
 */
export async function exportChangedFiles(
  client: BitbucketClient,
  changes: ClassifiedChange[],
  releaseBranch: string,
  outputDir: string
): Promise<ExportResult[]> {
  // 篩出實際需要匯出內容的檔案（新增 / 修改 / 更名新檔）
  const targets = changes.filter(c => c.needRelate || c.needDeliver);

  const results: ExportResult[] = [];

  console.log('');
  console.log(chalk.bold(`📦 開始匯出檔案（共 ${targets.length} 個）`));
  console.log(chalk.gray(`   來源分支：${releaseBranch}`));
  console.log(chalk.gray(`   輸出目錄：${path.resolve(outputDir)}`));
  console.log('');

  for (const c of targets) {
    const localPath = path.join(outputDir, c.repo, c.path);
    process.stdout.write(`  [${c.category}] ${c.repo}/${c.path} ...`);

    try {
      const content = await client.getRawFile(c.repo, c.path, releaseBranch);

      // 確保目錄存在
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, content);

      console.log(chalk.green(' ✅'));
      results.push({
        repo: c.repo,
        filePath: c.path,
        category: c.category,
        status: 'ok',
      });
    } catch (err: any) {
      const msg = err.response
        ? `HTTP ${err.response.status}`
        : (err.message || String(err));
      console.log(chalk.red(` ❌ ${msg}`));
      results.push({
        repo: c.repo,
        filePath: c.path,
        category: c.category,
        status: 'failed',
        error: msg,
      });
    }
  }

  return results;
}

export function printExportSummary(results: ExportResult[], outputDir: string): void {
  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'failed');

  console.log('');
  console.log(chalk.bold('===== 匯出結果 ====='));
  console.log(`  成功：${chalk.green(ok)} 個`);
  console.log(`  失敗：${failed.length > 0 ? chalk.red(failed.length) : 0} 個`);

  if (failed.length > 0) {
    console.log('');
    console.log(chalk.red.bold('  ⚠️ 以下檔案匯出失敗：'));
    for (const f of failed) {
      console.log(chalk.red(`    - ${f.repo}/${f.filePath}（${f.error}）`));
    }
  }

  console.log('');
  console.log(chalk.gray(`📁 檔案已匯出至：${path.resolve(outputDir)}`));
}

/**
 * 將匯出清單寫成 manifest.json，記錄這次匯出了哪些檔案。
 * 方便後續 Dimension 步驟讀取、核對。
 */
export function saveManifest(
  results: ExportResult[],
  releaseBranch: string,
  outputDir: string
): void {
  const manifest = {
    generatedAt: new Date().toISOString(),
    releaseBranch,
    total: results.length,
    ok: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'failed').length,
    files: results,
  };
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(chalk.gray(`📄 匯出清單：${manifestPath}`));
}
