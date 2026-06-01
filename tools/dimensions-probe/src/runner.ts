import { spawnSync } from 'child_process';

export interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

/**
 * 執行 dmcli。
 *
 * dmcli 有兩種使用模式：
 *  A. 互動模式：直接執行 dmcli 後進入互動 shell
 *  B. 命令模式：dmcli -cmd "指令"   或   把指令從 stdin 餵進去
 *
 * 為了「調查」目的，我們用 stdin 餵指令的方式，
 * 這樣可以送 help、版本查詢等，再讀回輸出。
 *
 * ⚠️ 重要：以下呼叫方式（-cmd 旗標、stdin 餵指令）是 Dimensions
 * 常見的用法，但確切旗標可能因版本而異。若執行失敗，
 * 工具會把實際的錯誤輸出顯示出來，方便判斷正確用法。
 */

/**
 * 用 stdin 餵入一段指令給 dmcli（適合互動模式）
 */
export function runViaStdin(dmcliPath: string, commands: string[], timeoutMs = 30000): RunResult {
  const input = commands.join('\n') + '\nexit\n';

  try {
    const result = spawnSync(dmcliPath, [], {
      input,
      encoding: 'utf-8',
      timeout: timeoutMs,
      windowsHide: true,
    });

    return {
      ok: result.status === 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.status,
      error: result.error?.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: err.message || String(err),
    };
  }
}

/**
 * 用命令列旗標方式執行（適合單一指令）
 * 例如：dmcli -cmd "help"
 */
export function runViaFlag(dmcliPath: string, args: string[], timeoutMs = 30000): RunResult {
  try {
    const result = spawnSync(dmcliPath, args, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      windowsHide: true,
    });

    return {
      ok: result.status === 0,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.status,
      error: result.error?.message,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: err.message || String(err),
    };
  }
}
