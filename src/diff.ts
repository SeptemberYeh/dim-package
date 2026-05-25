import { BitbucketChange } from './bitbucket';

export type ChangeCategory = 'M' | 'A' | 'R_NEW' | 'R_OLD' | 'D';

export interface ClassifiedChange {
  repo: string;
  category: ChangeCategory;
  path: string;          // 變更後路徑（對 R_OLD 是舊路徑）
  oldPath?: string;      // 僅 Renamed 才有
  /**
   * 用於後續流程的標記：
   *  - needRelate：需要對 Dimension relate（只有 [M]）
   *  - needCheckoutCheckin：需要 checkout/checkin（只有 [M]）
   *  - needDeliver：需要 deliver（[A] 和 R_NEW）
   *  - warning：警示清單（R_OLD 和 D）
   */
  needRelate: boolean;
  needCheckoutCheckin: boolean;
  needDeliver: boolean;
  warning: boolean;
}

/**
 * 將 Bitbucket 的 change type 對應到 Skill 定義的分類
 *
 * Bitbucket type → Skill 分類：
 *   ADD     → A
 *   MODIFY  → M
 *   DELETE  → D（警示）
 *   RENAME  → 拆成兩筆：R_NEW（新檔，視為 A）+ R_OLD（舊檔，警示）
 *   COPY    → 視為 A（保守處理）
 *   MOVE    → 等同 RENAME
 */
export function classifyChanges(repo: string, changes: BitbucketChange[]): ClassifiedChange[] {
  const result: ClassifiedChange[] = [];

  for (const c of changes) {
    const newPath = c.path?.toString;
    const oldPath = c.srcPath?.toString;

    if (!newPath) continue; // 跳過沒有路徑資訊的項目

    switch (c.type) {
      case 'MODIFY':
        result.push({
          repo,
          category: 'M',
          path: newPath,
          needRelate: true,
          needCheckoutCheckin: true,
          needDeliver: false,
          warning: false,
        });
        break;

      case 'ADD':
      case 'COPY':
        result.push({
          repo,
          category: 'A',
          path: newPath,
          needRelate: false,
          needCheckoutCheckin: false,
          needDeliver: true,
          warning: false,
        });
        break;

      case 'DELETE':
        result.push({
          repo,
          category: 'D',
          path: newPath,
          needRelate: false,
          needCheckoutCheckin: false,
          needDeliver: false,
          warning: true,
        });
        break;

      case 'RENAME':
      case 'MOVE':
        // 新檔名 → 視為 Added
        result.push({
          repo,
          category: 'R_NEW',
          path: newPath,
          oldPath: oldPath,
          needRelate: false,
          needCheckoutCheckin: false,
          needDeliver: true,
          warning: false,
        });
        // 舊檔名 → 警示清單
        if (oldPath) {
          result.push({
            repo,
            category: 'R_OLD',
            path: oldPath,
            needRelate: false,
            needCheckoutCheckin: false,
            needDeliver: false,
            warning: true,
          });
        }
        break;

      default:
        // 未知類型一律進警示，避免漏判
        result.push({
          repo,
          category: 'D',
          path: newPath,
          needRelate: false,
          needCheckoutCheckin: false,
          needDeliver: false,
          warning: true,
        });
    }
  }

  return result;
}

export function summarize(changes: ClassifiedChange[]) {
  return {
    modified: changes.filter(c => c.category === 'M').length,
    added: changes.filter(c => c.category === 'A').length,
    renamedNew: changes.filter(c => c.category === 'R_NEW').length,
    renamedOld: changes.filter(c => c.category === 'R_OLD').length,
    deleted: changes.filter(c => c.category === 'D').length,
    total: changes.length,
    warnings: changes.filter(c => c.warning).length,
  };
}
