#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, AppConfig } from './config';
import { BitbucketClient } from './bitbucket';
import { classifyChanges, ClassifiedChange } from './diff';
import { printChangesTable, printSummary, saveJson } from './output';
import { exportChangedFiles, printExportSummary, saveManifest } from './export';

const program = new Command();

program
  .name('release-diff')
  .description('比對 Bitbucket Server 上 master 與 release 分支差異，產出上線檔案清單 / 匯出實際檔案')
  .version('1.1.0');

/**
 * 共用：抓取所有 repo 的變更並分類。
 * 單一 repo 失敗不中斷其他 repo，會印出錯誤後繼續。
 */
async function collectChanges(
  client: BitbucketClient,
  config: AppConfig,
  releaseBranch: string
): Promise<ClassifiedChange[]> {
  const allChanges: ClassifiedChange[] = [];

  for (const repo of config.repos) {
    process.stdout.write(`  [${repo}] 查詢中...`);

    try {
      // 語義：since = master（起點），until = release 分支（終點）
      // 對應 git diff master release/xxx，列出從 master 到 release 之間的變更
      const changes = await client.getChanges(repo, config.baseBranch, releaseBranch);
      const classified = classifyChanges(repo, changes);
      allChanges.push(...classified);

      console.log(chalk.green(` ✅ ${classified.length} 個變更`));
    } catch (err: any) {
      if (err.response?.status === 404) {
        console.log(chalk.red(` ❌ 找不到分支或 repo（HTTP 404）`));
        console.log(chalk.gray(`     請確認：分支 "${config.baseBranch}" 與 "${releaseBranch}" 都存在於 ${repo}`));
        if (err.response.data) {
          console.log(chalk.gray(`     回應：${JSON.stringify(err.response.data)}`));
        }
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        console.log(chalk.red(` ❌ 認證失敗（HTTP ${err.response.status}）`));
        console.log(chalk.gray(`     請確認 username / password 與 repo 存取權限`));
      } else {
        console.log(chalk.red(` ❌ 查詢失敗`));
        console.log(chalk.gray(`     ${err.message || err}`));
        if (err.response) {
          console.log(chalk.gray(`     HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`));
        }
      }
    }
  }

  return allChanges;
}

function printHeader(config: AppConfig, releaseBranch: string): void {
  console.log(chalk.bold('🔍 比對設定'));
  console.log(`  Project   ：${config.bitbucket.projectKey}`);
  console.log(`  Repos     ：${config.repos.join(', ')}`);
  console.log(`  Base      ：${config.baseBranch}`);
  console.log(`  Release   ：${releaseBranch}`);
  console.log('');
}

// ============================================================
// diff 指令：產出變更清單
// ============================================================
program
  .command('diff')
  .description('產出本次 release 的檔案變更清單')
  .requiredOption('-r, --release <branch>', '本次 release 分支名稱 (e.g. release/20260523)')
  .option('-c, --config <path>', '設定檔路徑', 'config.json')
  .option('-o, --output <path>', '輸出 JSON 檔案路徑（預設不輸出）')
  .option('--no-table', '不在 terminal 顯示表格（適合 pipe 給其他工具）')
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      const client = new BitbucketClient(config.bitbucket);

      printHeader(config, opts.release);
      const allChanges = await collectChanges(client, config, opts.release);

      if (opts.table) {
        printChangesTable(allChanges);
      }
      printSummary(allChanges);

      if (opts.output) {
        saveJson(allChanges, opts.output);
      }
    } catch (err: any) {
      console.error('');
      console.error(chalk.red.bold('❌ 執行失敗'));
      console.error(chalk.red(err.message || err));
      if (err.response) {
        console.error(chalk.gray(`  HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`));
      }
      process.exit(1);
    }
  });

// ============================================================
// export 指令：匯出實際檔案內容
// ============================================================
program
  .command('export')
  .description('匯出本次 release 實際有新增/修改/更名的檔案內容到本地資料夾')
  .requiredOption('-r, --release <branch>', '本次 release 分支名稱 (e.g. release/20260523)')
  .option('-c, --config <path>', '設定檔路徑', 'config.json')
  .option('-d, --dir <path>', '匯出目錄', 'export')
  .option('--no-table', '不在 terminal 顯示變更表格')
  .action(async (opts) => {
    try {
      const config = loadConfig(opts.config);
      const client = new BitbucketClient(config.bitbucket);

      printHeader(config, opts.release);

      // 1. 先抓變更清單
      const allChanges = await collectChanges(client, config, opts.release);

      if (opts.table) {
        printChangesTable(allChanges);
      }
      printSummary(allChanges);

      // 2. 匯出實際檔案內容（M + A + R_NEW）
      const results = await exportChangedFiles(client, allChanges, opts.release, opts.dir);

      // 3. 輸出結果與 manifest
      printExportSummary(results, opts.dir);
      saveManifest(results, opts.release, opts.dir);

      // 若有失敗，以非零碼結束（方便 CI 判斷）
      const hasFailed = results.some(r => r.status === 'failed');
      if (hasFailed) {
        process.exit(2);
      }
    } catch (err: any) {
      console.error('');
      console.error(chalk.red.bold('❌ 執行失敗'));
      console.error(chalk.red(err.message || err));
      if (err.response) {
        console.error(chalk.gray(`  HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`));
      }
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
