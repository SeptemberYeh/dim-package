#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config';
import { BitbucketClient } from './bitbucket';
import { classifyChanges, ClassifiedChange } from './diff';
import { printChangesTable, printSummary, saveJson } from './output';

const program = new Command();

program
  .name('release-diff')
  .description('比對 Bitbucket Server 上 master 與 release 分支差異，產出上線檔案清單')
  .version('1.0.0');

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

      console.log(chalk.bold('🔍 比對設定'));
      console.log(`  Project   ：${config.bitbucket.projectKey}`);
      console.log(`  Repos     ：${config.repos.join(', ')}`);
      console.log(`  Base      ：${config.baseBranch}`);
      console.log(`  Release   ：${opts.release}`);
      console.log('');

      const allChanges: ClassifiedChange[] = [];

      for (const repo of config.repos) {
        process.stdout.write(`  [${repo}] 查詢中...`);

        // 先確認 release 分支存在
        const exists = await client.branchExists(repo, opts.release);
        if (!exists) {
          console.log(chalk.red(` ❌ 找不到分支 ${opts.release}`));
          continue;
        }

        // 注意 API 語義：from = release, to = master
        // 代表「相對於 master，release 上有哪些變更」
        const changes = await client.getChanges(repo, opts.release, config.baseBranch);
        const classified = classifyChanges(repo, changes);
        allChanges.push(...classified);

        console.log(chalk.green(` ✅ ${classified.length} 個變更`));
      }

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

program.parseAsync(process.argv);
