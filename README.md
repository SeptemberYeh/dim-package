# release-diff-cli

比對 Bitbucket Server 上 `master` 與 `release` 分支差異，產出上線檔案清單。

對應 SKILL.md 中的 **Step 1：產出檔案變更清單**。

---

## 安裝

```bash
npm install
```

## 設定

複製 `config.example.json` 為 `config.json`，填入實際設定：

```json
{
  "bitbucket": {
    "baseUrl": "https://bitbucket.your-company.com",
    "username": "your-username",
    "password": "your-password",
    "projectKey": "YOUR_PROJECT_KEY"
  },
  "repos": [
    "MyFrontendCode",
    "MyBackendCode"
  ],
  "baseBranch": "master"
}
```

> ⚠️ `config.json` 含有密碼，請加入 `.gitignore`，不要提交到版控。

## 使用

### 顯示在 terminal

```bash
npm run start -- diff --release release/20260523
```

### 同時輸出 JSON 給後續流程使用

```bash
npm run start -- diff --release release/20260523 --output changes.json
```

### 只輸出 JSON（不顯示表格）

```bash
npm run start -- diff --release release/20260523 --output changes.json --no-table
```

### 匯出實際檔案內容

把本次 release 實際有**新增 / 修改 / 更名**的檔案內容，從 release 分支抓下來，
保留 repo 與目錄結構存到本地資料夾（可直接拿去覆蓋 Dimension workarea）。

```bash
npm run start -- export --release release/20260523
```

匯出目錄一律放在 `export/` 底下：
- 未指定 `--dir`：自動用 release 名稱當子資料夾，如 `export/release-20260523`
  （分支名稱裡的 `/` 會換成 `-`）
- 指定 `--dir foo`：放到 `export/foo`

這樣 `.gitignore` 一條 `export/` 就能排除所有匯出內容，不會進版控。

匯出對象：
- `[M]` Modified（修改）
- `[A]` Added（新增）
- `[R→新]` Renamed 新檔名

不含：`[⚠️R→舊]` 更名前舊檔、`[⚠️D]` 刪除檔（這些沒有實際內容要搬）

輸出結構：
```
export/release-20260523/
├── MyFrontendCode/
│   └── src/components/Button.vue
├── MyBackendCode/
│   └── src/main/java/com/example/Service.java
└── manifest.json          ← 本次匯出清單（含成功/失敗記錄）
```

---

## 輸出說明

### Terminal 表格

```
=== MyFrontendCode ===
┌────────────┬──────────────────────────────────────┬─────────────────────┐
│ 類型       │ 路徑                                 │ 備註                │
├────────────┼──────────────────────────────────────┼─────────────────────┤
│ [M]        │ src/components/Button.vue            │                     │
│ [A]        │ src/components/NewWidget.vue         │                     │
│ [⚠️R→舊]   │ src/components/OldName.vue           │ 需人工確認          │
│ [R→新]     │ src/components/NewName.vue           │ 原檔名：...         │
│ [⚠️D]      │ src/utils/deprecated.js              │ 需人工確認          │
└────────────┴──────────────────────────────────────┴─────────────────────┘
```

### 變更類型對應（與 SKILL.md 一致）

| 類型 | 說明 | 後續處理 |
|---|---|---|
| `[M]` | Modified | relate → checkout → checkin |
| `[A]` | Added | deliver |
| `[R→新]` | Renamed 新檔名 | 視為 Added → deliver |
| `[⚠️R→舊]` | Renamed 舊檔名 | 警示清單，人工處理 |
| `[⚠️D]` | Deleted | 警示清單，人工處理 |

### JSON 格式

```json
{
  "generatedAt": "2026-05-24T14:30:00.000Z",
  "summary": {
    "modified": 3,
    "added": 2,
    "renamedNew": 1,
    "renamedOld": 1,
    "deleted": 0,
    "total": 7,
    "warnings": 1
  },
  "changes": [
    {
      "repo": "MyFrontendCode",
      "category": "M",
      "path": "src/components/Button.vue",
      "needRelate": true,
      "needCheckoutCheckin": true,
      "needDeliver": false,
      "warning": false
    }
  ]
}
```

---

## API 說明

本工具使用 Bitbucket Server REST API v1.0：
- `GET /rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/compare/changes`
- `GET /rest/api/1.0/projects/{projectKey}/repos/{repoSlug}/branches`

⚠️ **API 語義注意**：
Bitbucket 的 `compare/changes` 參數中：
- `from` = release 分支
- `to` = master

代表「相對於 `to`（master），`from`（release）上有哪些變更」。
此語義已在程式內處理，使用者不需要自行注意參數順序。

---

## 後續步驟

產出的 JSON 將作為下一個工具（Dimension MCP / CLI）的輸入，
用於執行 relate / checkout / checkin / deliver 等 Dimension 操作。
