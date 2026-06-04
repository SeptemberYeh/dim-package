#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, DimConfig } from './config';
import {
  loadAndCategorize, copyToWorkarea, makeDeployDimFile,
  CategorizedFiles,
} from './manifest';
import { writeDeployDim } from './deploydim';
import {
  OperationContext,
  buildRelate, buildCheckout, buildCheckin, buildDeliver, buildActionRequest,
  execRelate, execCheckout, execCheckin, execDeliver, execActionRequest,
} from './commands';
import { DmcliConnection, testConnection, DmcliResult } from './dmcli';

const program = new Command();

program
  .name('dim-release')
  .description('自動化 Dimensions CM 上線流程（逐檔 relate/checkout/checkin/deliver + DEPLOY.DIM）')
  .version('0.3.0');

function makeConn(config: DimConfig, password: string): DmcliConnection {
  return {
    username: config.username, password,
    host: config.host, dbname: config.dbname, dsn: config.dsn,
    dmcliPath: config.dmcliPath,
  };
}

function makeContext(config: DimConfig, password: string): OperationContext {
  return {
    conn: makeConn(config, password),
    requestId: config.requestId,
    workset: config.workset,
    relateType: config.relateType,
    partSpec: config.partSpec,
    defaultFormat: config.defaultFormat,
  };
}

/** 載入分類，並把 DEPLOY.DIM 併入 modified（DEPLOY.DIM 已在 prepare 產生） */
function loadWithDeployDim(config: DimConfig): CategorizedFiles {
  const cat = loadAndCategorize(config);
  const deployPath = path.win32.join(config.workareaRoot, 'DEPLOY.DIM');
  // 本機測試時 workareaRoot 可能是非 Windows 路徑，故兩種組法都檢查
  const deployPathLocal = path.join(config.workareaRoot, 'DEPLOY.DIM');
  if (fs.existsSync(deployPath) || fs.existsSync(deployPathLocal)) {
    cat.modified.push(makeDeployDimFile(deployPath, config));
  } else {
    console.log(chalk.yellow('⚠️  找不到 DEPLOY.DIM，請先執行 prepare。DEPLOY.DIM 不會被納入這次處理。'));
  }
  return cat;
}

function logLine(log: string[], s: string) {
  log.push(s.replace(/\x1b\[[0-9;]*m/g, ''));
  console.log(s);
}
function saveLog(log: string[]) {
  const p = `dim-release-${Date.now()}.log`;
  fs.writeFileSync(p, log.join('\n'), 'utf-8');
  console.log(chalk.gray(`日誌已存：${p}`));
}
function checkFail(log: string[], r: DmcliResult, what: string): boolean {
  if (!r.ok) {
    logLine(log, chalk.red(`  ❌ ${what} 失敗`));
    logLine(log, chalk.gray(`${r.stdout}\n${r.stderr}\n${r.error ?? ''}`));
    return true;
  }
  return false;
}

// ============================================================
// test-conn
// ============================================================
program
  .command('test-conn')
  .description('測試 dmcli 連線')
  .option('-c, --config <path>', '設定檔路徑', 'dim-config.json')
  .requiredOption('-p, --password <pwd>', 'Dimensions 密碼')
  .action((opts) => {
    try {
      const config = loadConfig(opts.config);
      const conn = makeConn(config, opts.password);
      console.log(chalk.gray(`測試連線 ${config.username}@${config.host} ...`));
      const r = testConnection(conn);
      console.log(r.ok ? chalk.green('✅ 連線成功') : chalk.red('❌ 連線失敗（或無法判斷）'));
      console.log(chalk.gray('--- dmcli 輸出 ---'));
      console.log(r.stdout || '(無 stdout)');
      if (r.stderr) console.log(chalk.yellow(r.stderr));
      if (r.error) console.log(chalk.red(r.error));
    } catch (err: any) {
      console.error(chalk.red.bold('❌ 失敗：'), chalk.red(err.message || err));
      process.exit(1);
    }
  });

// ============================================================
// prepare：覆蓋 workarea + 產生 DEPLOY.DIM（純本機）
// ============================================================
program
  .command('prepare')
  .description('覆蓋 workarea + 產生 DEPLOY.DIM（不連 Dimensions）')
  .option('-c, --config <path>', '設定檔路徑', 'dim-config.json')
  .action((opts) => {
    try {
      const config = loadConfig(opts.config);
      const { modified, added } = loadAndCategorize(config);
      const all = [...modified, ...added];

      console.log(chalk.bold(`修改檔 ${modified.length} 個、新增檔 ${added.length} 個`));

      console.log(chalk.bold.cyan('\n━━━ 覆蓋 workarea ━━━'));
      copyToWorkarea(all, config);
      console.log(chalk.green(`  ✅ 已覆蓋 ${all.length} 個檔案`));

      console.log(chalk.bold.cyan('\n━━━ 產生 DEPLOY.DIM ━━━'));
      // DEPLOY.DIM 內容 = 異動 + 新增的所有檔案
      const deployPath = writeDeployDim(all, config);
      console.log(chalk.green(`  ✅ DEPLOY.DIM 已產生：${deployPath}`));
      console.log(chalk.gray(`     （含 ${all.length} 筆搬檔指令；DEPLOY.DIM 本身會在 relate/checkin 階段一起處理）`));

      console.log(chalk.yellow('\n下一步：dim-release relate-status --password "..."'));
    } catch (err: any) {
      console.error(chalk.red.bold('❌ 失敗：'), chalk.red(err.message || err));
      process.exit(1);
    }
  });

// ============================================================
// relate-status：Relate（修改檔+DEPLOY.DIM）→ 變更狀態 → 停（等覆核）
// ============================================================
program
  .command('relate-status')
  .description('Step1-2：Relate（修改檔+DEPLOY.DIM）+ 變更狀態，完成後暫停等人工覆核')
  .option('-c, --config <path>', '設定檔路徑', 'dim-config.json')
  .requiredOption('-p, --password <pwd>', 'Dimensions 密碼')
  .option('--yes', '確認執行')
  .action((opts) => {
    try {
      const config = loadConfig(opts.config);
      const ctx = makeContext(config, opts.password);
      const { modified, added } = loadWithDeployDim(config);

      if (!opts.yes) {
        console.log(chalk.bold.yellow('⚠️  即將 relate 並變更狀態。'));
        console.log(chalk.yellow(`   修改檔(含DEPLOY.DIM) ${modified.length} 個會 relate`));
        console.log(chalk.yellow(`   request 狀態會改為：${config.targetStatus}`));
        console.log(chalk.yellow('   確認請加 --yes 重新執行。'));
        process.exit(0);
      }

      const log: string[] = [];

      // Step 1：Relate（僅修改檔 + DEPLOY.DIM；新增檔不 relate）
      logLine(log, chalk.bold.cyan('━━━ Step 1：Relate ━━━'));
      for (const f of modified) {
        logLine(log, chalk.gray('  ' + buildRelate(ctx, f.dim)));
        const r = execRelate(ctx, f.dim);
        if (checkFail(log, r, `relate ${f.filePath}`)) { saveLog(log); process.exit(2); }
        logLine(log, chalk.green(`  ✅ relate ${f.filePath}`));
      }

      // Step 2：變更狀態
      logLine(log, chalk.bold.cyan('━━━ Step 2：變更狀態 ━━━'));
      logLine(log, chalk.gray('  ' + buildActionRequest(config.requestId, config.targetStatus, config.comment)));
      const ar = execActionRequest(ctx, config.targetStatus, config.comment);
      if (checkFail(log, ar, '變更狀態')) { saveLog(log); process.exit(2); }
      logLine(log, chalk.green(`  ✅ ${config.requestId} -> ${config.targetStatus}`));

      saveLog(log);
      console.log(chalk.bold.yellow('\n⏸  請進行第一關覆核。'));
      console.log(chalk.yellow('   覆核完成後，執行：dim-release finish --password "..." --yes'));
    } catch (err: any) {
      console.error(chalk.red.bold('❌ 失敗：'), chalk.red(err.message || err));
      process.exit(1);
    }
  });

// ============================================================
// finish：覆核後 → Checkout→覆蓋→Checkin（修改檔+DEPLOY.DIM）→ Deliver（新增檔）
// ============================================================
program
  .command('finish')
  .description('Step4-5：覆核後執行 Checkout→覆蓋→Checkin（修改檔+DEPLOY.DIM）+ Deliver（新增檔）')
  .option('-c, --config <path>', '設定檔路徑', 'dim-config.json')
  .requiredOption('-p, --password <pwd>', 'Dimensions 密碼')
  .option('--yes', '確認已完成覆核並執行')
  .action((opts) => {
    try {
      const config = loadConfig(opts.config);
      const ctx = makeContext(config, opts.password);
      const { modified, added } = loadWithDeployDim(config);

      if (!opts.yes) {
        console.log(chalk.bold.yellow('⚠️  即將執行 checkout/覆蓋/checkin/deliver。'));
        console.log(chalk.yellow('   請確認第一關覆核已完成。確認請加 --yes。'));
        process.exit(0);
      }

      const log: string[] = [];

      // Step 4a：Checkout 全部（修改檔 + DEPLOY.DIM）
      logLine(log, chalk.bold.cyan('━━━ Step 4a：Checkout ━━━'));
      for (const f of modified) {
        logLine(log, chalk.gray('  ' + buildCheckout(ctx, f.dim)));
        const r = execCheckout(ctx, f.dim);
        if (checkFail(log, r, `checkout ${f.filePath}`)) { saveLog(log); process.exit(2); }
        logLine(log, chalk.green(`  ✅ checkout ${f.filePath}`));
      }

      // Step 4b：覆蓋 workarea（修改檔；DEPLOY.DIM 已在 prepare 寫好，這裡確保都到位）
      logLine(log, chalk.bold.cyan('━━━ Step 4b：覆蓋 workarea ━━━'));
      // 只覆蓋來自 export 的修改檔（DEPLOY.DIM 是產生的，prepare 已寫，不從 export 來）
      const fromExport = modified.filter(f => f.filePath !== 'DEPLOY.DIM');
      copyToWorkarea(fromExport, config);
      logLine(log, chalk.green(`  ✅ 已覆蓋 ${fromExport.length} 個修改檔（DEPLOY.DIM 於 prepare 已寫入）`));

      // Step 4c：Checkin 全部（修改檔 + DEPLOY.DIM）
      logLine(log, chalk.bold.cyan('━━━ Step 4c：Checkin ━━━'));
      for (const f of modified) {
        logLine(log, chalk.gray('  ' + buildCheckin(ctx, f.dim, config.comment)));
        const r = execCheckin(ctx, f.dim, config.comment);
        if (checkFail(log, r, `checkin ${f.filePath}`)) { saveLog(log); process.exit(2); }
        logLine(log, chalk.green(`  ✅ checkin ${f.filePath}`));
      }

      // Step 5：Deliver（新增檔）
      logLine(log, chalk.bold.cyan('━━━ Step 5：Deliver（新增檔）━━━'));
      for (const f of added) {
        logLine(log, chalk.gray('  ' + buildDeliver(ctx, f.dim, config.comment)));
        const r = execDeliver(ctx, f.dim, config.comment);
        if (checkFail(log, r, `deliver ${f.filePath}`)) { saveLog(log); process.exit(2); }
        logLine(log, chalk.green(`  ✅ deliver ${f.filePath}`));
      }

      logLine(log, chalk.bold.green('\n✅ 上線流程完成'));
      saveLog(log);
    } catch (err: any) {
      console.error(chalk.red.bold('❌ 失敗：'), chalk.red(err.message || err));
      process.exit(1);
    }
  });

program.parseAsync(process.argv);
