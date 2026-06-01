# dimensions-probe

調查 Dimensions CM 命令列 (`dmcli`) 環境的小工具。

**目的：** 你們平常都用 GUI、沒用過命令列。這個工具會去「問 dmcli 自己」有哪些指令可用，
而不是憑空猜測，藉此摸清環境，作為後續撰寫上線自動化工具的依據。

---

## 這個工具會做什麼

1. **定位 dmcli** — 從環境變數、常見安裝路徑、PATH 找出 `dmcli.exe`
2. **查版本** — 確認 Dimensions 版本
3. **抓 help 清單** — 透過 `help` 指令列出 dmcli 支援的所有指令
4. **查關鍵指令用法** — 針對上線流程要用的操作（relate / checkin / checkout / deliver / 狀態變更）逐一問語法

⚠️ **誠實說明：** dmcli 沒有「列舉所有指令」的 API。本工具是執行 dmcli 內建的 `help`
來取得清單。若某些呼叫方式（旗標、stdin）在你的版本不適用，工具會把實際錯誤顯示出來，
方便判斷正確用法。

---

## 環境需求

- Windows
- 這台電腦已安裝 Dimensions 客戶端
- Node.js

## 安裝

```bash
npm install
```

## 使用

### 基本：自動偵測並調查

```bash
npm run start -- probe
```

### 若自動偵測找不到 dmcli，手動指定路徑

```bash
npm run start -- probe --path "C:\Program Files\Serena\Dimensions\14.3\Prog\dmcli.exe"
```

### 把完整調查結果存成檔案（方便回報）

```bash
npm run start -- probe --output dim-probe-result.txt
```

---

## 找不到 dmcli 怎麼辦

dmcli.exe 通常在 Dimensions 安裝目錄底下，常見位置：

```
C:\Program Files\Serena\Dimensions\<版本>\Prog\dmcli.exe
C:\Program Files (x86)\Micro Focus\Dimensions\<版本>\Prog\dmcli.exe
```

你可以：
1. 在檔案總管搜尋 `dmcli.exe`
2. 找到後用 `--path` 指定

---

## 調查完之後

把執行輸出（特別是 help 清單與指令用法那幾段）提供出來，
就能依你環境「實際支援的指令語法」撰寫上線自動化工具，
不必依賴對 dmcli 版本的猜測。
