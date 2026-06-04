# dimensions-cli（逐檔 relate/checkout/checkin/deliver + DEPLOY.DIM）

自動化 Dimensions CM 上線流程的 CLI。

## 流程

```
prepare（純本機）
  ├ 覆蓋 workarea（修改檔 + 新增檔）
  └ 產生 DEPLOY.DIM 並寫到 VOB 根目錄（內容 = 異動+新增的搬檔指令）

relate-status（連 Dimensions）
  ├ Step 1  Relate（修改檔 + DEPLOY.DIM；新增檔不 relate）
  └ Step 2  變更狀態（AC）
  → 完成後暫停，等第一關覆核

【第一關覆核】人工確認

finish（連 Dimensions）
  ├ Step 4  Checkout → 覆蓋 → Checkin（修改檔 + DEPLOY.DIM）
  └ Step 5  Deliver（新增檔）
```

順序：Relate → 變更狀態 → 覆核 → Checkout → 覆蓋 → Checkin → Deliver

## DEPLOY.DIM

- 每次上線都要更新的搬檔指令文件，放在 VOB 根目錄（`{workareaRoot}\DEPLOY.DIM`）
- 內容是 7 欄 CSV：`"MOD","DIM主機IP","DIM路徑","檔名","編譯機IP","編譯機路徑","檔名"`
- 涵蓋這次「異動 + 新增」的所有檔案
- DEPLOY.DIM 本身是 Dimensions 控管檔，會跟修改檔一起跑 relate/checkout/checkin
- 編譯機路徑依 buildEnv：
  - windows：`D:\{VOB_NAME}\{相對路徑}`
  - K8S：`root\K8S\{VOB_NAME}\{相對路徑}`

## 安裝

```bash
npm install
cp dim-config.example.json dim-config.json   # 填入設定
```

連線用完整參數（-user/-pass/-host/-dbname/-dsn）直接帶帳密，避免跳登入視窗。
密碼每次用 --password 帶入，不存設定檔。

## 使用

```bash
# 1. 測連線
npm run start -- test-conn --password "你的密碼"

# 2. 覆蓋 workarea + 產生 DEPLOY.DIM（純本機）
npm run start -- prepare

# 3. Relate + 變更狀態（之後暫停等覆核）
npm run start -- relate-status --password "你的密碼" --yes

# 4. 【人工覆核】

# 5. 覆核後：Checkout/覆蓋/Checkin + Deliver
npm run start -- finish --password "你的密碼" --yes
```

## 待確認項目

見 TODO.txt。重點：item-spec 定位（/FILENAME 格式，filenameMode）、
targetStatus、partSpec、DEPLOY.DIM 各欄位 IP/路徑、relateType。
