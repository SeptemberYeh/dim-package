import { DmcliConnection, DmcliResult, runDmCommand, quoteArg } from './dmcli';

/**
 * ============================================================
 * Dimensions 上線流程 — 逐檔 RICD/EI/RI/CI 路線
 * ============================================================
 *
 * 所有指令語法皆由 help 確認（14.3.2）。
 *
 * 因 item-id 含系統自動產生的內部 ID（無法人工算出），
 * 不自組完整 item-spec，改用「product 前綴 + /FILENAME」定位檔案。
 *
 * 流程順序：
 *   Relate(修改檔+DEPLOY.DIM) → 變更狀態 → 覆核 →
 *   Checkout → 覆蓋 → Checkin(修改檔+DEPLOY.DIM) → Deliver(新增檔)
 */

/** 上線流程要操作的單一檔案 */
export interface DimFile {
  /** item-spec 的 product 前綴，例如 "MYVOB:" */
  productPrefix: string;
  /** /FILENAME 的值（格式由 config.filenameMode 決定） */
  fileNameValue: string;
  /** workarea 中的完整路徑（/USER_FILENAME 與覆蓋用） */
  workareaPath: string;
}

export interface OperationContext {
  conn: DmcliConnection;
  /** Dimensions request 單號（/CHANGE_DOC_IDS） */
  requestId: string;
  /** project/stream（/WORKSET） */
  workset: string;
  /** relate 關聯類型 */
  relateType: 'IN_RESPONSE_TO' | 'AFFECTED' | 'INFO';
  /** CI（deliver）必填的 part-spec */
  partSpec: string;
  /** CI（deliver）選用的 /FORMAT */
  defaultFormat?: string;
}

/**
 * ── RICD：Relate（help 確認）──
 *   RICD <item-spec> [/FILENAME=<file>] /CHANGE_DOC_IDS=(...)
 *        [/AFFECTED | /IN_RESPONSE_TO | /INFO] [/WORKSET=<project>]
 */
export function buildRelate(ctx: OperationContext, file: DimFile): string {
  return [
    `RICD ${file.productPrefix}`,
    `/FILENAME=${quoteArg(file.fileNameValue)}`,
    `/CHANGE_DOC_IDS=(${ctx.requestId})`,
    `/${ctx.relateType}`,
    `/WORKSET=${quoteArg(ctx.workset)}`,
  ].join(' ');
}

/**
 * ── EI：Extract (Check Out) Item（help 確認）──
 *   EI <item-spec> [/FILENAME=<file>] [/USER_FILENAME=<path>]
 *      [/WORKSET=<project>] [/[NO]OVERWRITE] ...
 */
export function buildCheckout(ctx: OperationContext, file: DimFile): string {
  return [
    `EI ${file.productPrefix}`,
    `/FILENAME=${quoteArg(file.fileNameValue)}`,
    `/WORKSET=${quoteArg(ctx.workset)}`,
    `/USER_FILENAME=${quoteArg(file.workareaPath)}`,
    `/OVERWRITE`,
  ].join(' ');
}

/**
 * ── RI：Return (Check In) Item（help 確認）──
 *   RI <item-spec> [/FILENAME=<file>] [/USER_FILENAME=<path>]
 *      [/COMMENT=<text>] [/WORKSET=<project>] [/[NO]CANCEL_UNCHANGED] ...
 *   注意：RI 沒有 /CHANGE_DOC_IDS（關聯在 relate 已做）。
 */
export function buildCheckin(ctx: OperationContext, file: DimFile, comment: string): string {
  return [
    `RI ${file.productPrefix}`,
    `/FILENAME=${quoteArg(file.fileNameValue)}`,
    `/WORKSET=${quoteArg(ctx.workset)}`,
    `/USER_FILENAME=${quoteArg(file.workareaPath)}`,
    `/COMMENT=${quoteArg(comment)}`,
    `/NOCANCEL_UNCHANGED`,
  ].join(' ');
}

/**
 * ── CI：Create Item（deliver，help 確認）──
 *   CI <item-spec> /PART=<part> /FILENAME=<file>
 *      [/USER_FILENAME=<path>] [/FORMAT=<fmt>] [/CHANGE_DOC_IDS=(...)]
 *      [/WORKSET=<project>] [/DESCRIPTION=<text>] ...
 *   必填：item-spec、/PART、/FILENAME
 */
export function buildDeliver(ctx: OperationContext, file: DimFile, description: string): string {
  const parts = [
    `CI ${file.productPrefix}`,
    `/PART=${quoteArg(ctx.partSpec)}`,
    `/FILENAME=${quoteArg(file.fileNameValue)}`,
    `/USER_FILENAME=${quoteArg(file.workareaPath)}`,
    `/WORKSET=${quoteArg(ctx.workset)}`,
    `/CHANGE_DOC_IDS=(${ctx.requestId})`,
    `/DESCRIPTION=${quoteArg(description)}`,
  ];
  if (ctx.defaultFormat) {
    parts.push(`/FORMAT=${quoteArg(ctx.defaultFormat)}`);
  }
  return parts.join(' ');
}

/**
 * ── AC：Action Request（變更狀態，文件確認 p.38）──
 *   AC <request-id> [/STATUS=<status>] [/COMMENT=<text>]
 */
export function buildActionRequest(requestId: string, status: string, comment?: string): string {
  let cmd = `AC ${requestId} /STATUS=${quoteArg(status)}`;
  if (comment) cmd += ` /COMMENT=${quoteArg(comment)}`;
  return cmd;
}

/** 執行包裝 */
export function execRelate(ctx: OperationContext, file: DimFile): DmcliResult {
  return runDmCommand(ctx.conn, buildRelate(ctx, file));
}
export function execCheckout(ctx: OperationContext, file: DimFile): DmcliResult {
  return runDmCommand(ctx.conn, buildCheckout(ctx, file));
}
export function execCheckin(ctx: OperationContext, file: DimFile, comment: string): DmcliResult {
  return runDmCommand(ctx.conn, buildCheckin(ctx, file, comment));
}
export function execDeliver(ctx: OperationContext, file: DimFile, description: string): DmcliResult {
  return runDmCommand(ctx.conn, buildDeliver(ctx, file, description));
}
export function execActionRequest(ctx: OperationContext, status: string, comment?: string): DmcliResult {
  return runDmCommand(ctx.conn, buildActionRequest(ctx.requestId, status, comment));
}
