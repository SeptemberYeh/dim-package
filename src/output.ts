import Table from 'cli-table3';
import chalk from 'chalk';
import * as fs from 'fs';
import { ClassifiedChange, summarize, ChangeCategory } from './diff';

const CATEGORY_LABEL: Record<ChangeCategory, string> = {
  M: '[M]',
  A: '[A]',
  R_NEW: '[R→新]',
  R_OLD: '[⚠️R→舊]',
  D: '[⚠️D]',
};

function colorize(category: ChangeCategory, text: string): string {
  switch (category) {
    case 'M': return chalk.cyan(text);
    case 'A': return chalk.green(text);
    case 'R_NEW': return chalk.blue(text);
    case 'R_OLD': return chalk.yellow(text);
    case 'D': return chalk.red(text);
  }
}

export function printChangesTable(changes: ClassifiedChange[]): void {
  // 依 repo 分組顯示
  const repos = Array.from(new Set(changes.map(c => c.repo)));

  for (const repo of repos) {
    const repoChanges = changes.filter(c => c.repo === repo);

    console.log('');
    console.log(chalk.bold(`=== ${repo} ===`));

    const table = new Table({
      head: [chalk.bold('類型'), chalk.bold('路徑'), chalk.bold('備註')],
      colWidths: [12, 70, 30],
      wordWrap: true,
    });

    for (const c of repoChanges) {
      const label = colorize(c.category, CATEGORY_LABEL[c.category]);
      const note =
        c.category === 'R_NEW' ? `原檔名：${c.oldPath ?? '(unknown)'}` :
        c.category === 'R_OLD' ? '需人工確認' :
        c.category === 'D' ? '需人工確認' :
        '';
      table.push([label, c.path, note]);
    }

    console.log(table.toString());
  }
}

export function printSummary(changes: ClassifiedChange[]): void {
  const s = summarize(changes);
  console.log('');
  console.log(chalk.bold('===== 統計 ====='));
  console.log(`  [M] Modified           ：${s.modified}`);
  console.log(`  [A] Added              ：${s.added}`);
  console.log(`  [R→新] Renamed 新檔    ：${s.renamedNew}`);
  console.log(`  [⚠️R→舊] Renamed 舊檔  ：${s.renamedOld}  ${chalk.yellow('(需人工確認)')}`);
  console.log(`  [⚠️D] Deleted          ：${s.deleted}  ${chalk.red('(需人工確認)')}`);
  console.log(`  ─────────────────────`);
  console.log(`  總計                   ：${s.total}`);

  if (s.warnings > 0) {
    console.log('');
    console.log(chalk.yellow.bold(`⚠️  共有 ${s.warnings} 個項目需要人工確認，請查看上方標示的項目`));
  }
}

export function saveJson(changes: ClassifiedChange[], outputPath: string): void {
  const summary = summarize(changes);
  const payload = {
    generatedAt: new Date().toISOString(),
    summary,
    changes,
  };
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log('');
  console.log(chalk.gray(`📄 JSON 已輸出：${outputPath}`));
}
