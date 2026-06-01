#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import { locateDmcli } from './locate';
import { runViaStdin, runViaFlag, RunResult } from './runner';

const program = new Command();

program
  .name('dim-probe')
  .description('調查 Dimensions CM 命令列 (dmcli) 環境')
  .version('1.0.0');

function section(title: string) {
  console.log('');
  console.log(chalk.bold.cyan(`━━━ ${title} ━━━`));
}

function printRun(r: RunResult) {
  if (r.stdout.trim()) {
    console.log(chalk.gray('--- stdout ---'));
    console.log(r.stdout.trim());
  }
  if (r.stderr.trim()) {
    console.log(chalk.yellow('--- stderr ---'));
    console.log(r.stderr.trim());
  }
  if (r.error) {
    console.log(chalk.red(`--- 執行錯誤 ---`));
    console.log(chalk.red(r.error));
  }
  console.log(chalk.gray(`(exit code: ${r.exitCode})`));
}

program
  .command('probe')
  .description('偵測 dmcli 安裝、版本，並嘗試抓取可用指令清單')
  .option('-p, --path <path>', '手動指定 dmcli.exe 完整路徑')
  .option('-o, --output <file>', '把完整調查結果存成文字檔')
  .action((opts) => {
    const log: string[] = [];
    const capture = (s: string) => { log.push(s.replace(/\x1b\[[0-9;]*m/g, '')); };

    // ========== 1. 定位 dmcli ==========
    section('1. 定位 dmcli');
    const loc = locateDmcli(opts.path);

    if (!loc.found) {
      console.log(chalk.red('❌ 找不到 dmcli.exe'));
      console.log('');
      console.log('已嘗試的路徑：');
      loc.candidates.forEach(c => console.log(chalk.gray(`  - ${c}`)));
      console.log('');
      console.log(chalk.yellow('請手動找出 dmcli.exe 的位置，常見在 Dimensions 安裝目錄的 Prog 或 bin 資料夾下。'));
      console.log(chalk.yellow('找到後用 --path 重新執行：'));
      console.log(chalk.gray('  npm run start -- probe --path "C:\\...\\Prog\\dmcli.exe"'));
      capture(`找不到 dmcli。嘗試過：\n${loc.candidates.join('\n')}`);
      if (opts.output) fs.writeFileSync(opts.output, log.join('\n'), 'utf-8');
      process.exit(1);
    }

    console.log(chalk.green(`✅ 找到 dmcli`));
    console.log(`   路徑：${loc.path}`);
    console.log(`   來源：${loc.source}`);
    capture(`找到 dmcli：${loc.path}（來源：${loc.source}）`);

    const dmcli = loc.path!;

    // ========== 2. 查版本 ==========
    section('2. 查詢版本');
    console.log(chalk.gray('嘗試方式 A：dmcli /v'));
    let verResult = runViaFlag(dmcli, ['/v']);
    if (!verResult.ok && !verResult.stdout.trim()) {
      console.log(chalk.gray('嘗試方式 B：dmcli -v'));
      verResult = runViaFlag(dmcli, ['-v']);
    }
    printRun(verResult);
    capture(`版本查詢輸出：\n${verResult.stdout}\n${verResult.stderr}`);

    // ========== 3. 抓 help 指令清單 ==========
    section('3. 抓取可用指令清單 (help)');
    console.log(chalk.gray('透過 stdin 送出 "help" 指令...'));
    const helpResult = runViaStdin(dmcli, ['help']);
    printRun(helpResult);
    capture(`help 輸出：\n${helpResult.stdout}\n${helpResult.stderr}`);

    // ========== 4. 針對我們關心的指令查 help ==========
    section('4. 查詢上線流程相關指令的用法');
    // 這些是我們流程需要的操作關鍵字，逐一問 dmcli 是否認得
    const targetCommands = [
      'relate',     // 標記檔案異動
      'ci',         // check in（常見縮寫）
      'co',         // check out（常見縮寫）
      'checkin',
      'checkout',
      'deliver',    // 新增檔案
      'uri',        // update item status（可能的狀態變更指令）
    ];

    console.log(chalk.gray(`逐一查詢：${targetCommands.join(', ')}`));
    console.log(chalk.gray('（用 help <指令> 問 dmcli 每個指令的語法）'));
    console.log('');

    const helpForCmd = targetCommands.map(cmd => `help ${cmd}`);
    const cmdHelpResult = runViaStdin(dmcli, helpForCmd);
    printRun(cmdHelpResult);
    capture(`指令用法查詢輸出：\n${cmdHelpResult.stdout}\n${cmdHelpResult.stderr}`);

    // ========== 結束 ==========
    section('調查完成');
    console.log('請把以上輸出（特別是第 3、4 段）提供給協助者，');
    console.log('就能依據你環境「實際支援的指令語法」來撰寫自動化工具。');

    if (opts.output) {
      fs.writeFileSync(opts.output, log.join('\n'), 'utf-8');
      console.log('');
      console.log(chalk.gray(`📄 完整結果已存到：${opts.output}`));
    }
  });

program.parseAsync(process.argv);
