# Claude Image 0.1.0

2026-10-12 · Windows x64 · MIT

在 Claude Desktop 普通聊天中，用一句簡短描述生成一張圖；背景操作、聊天預覽及原檔下載已有實機樣本。Claude Image 是非官方擴充套件，資料去向與保存方式見 [隱私說明](../PRIVACY.md)。

## 下載

公開 repository 已建立；0.1.0 Release 正在準備，發布完成後以 Release Assets 為準。

- [GitHub repository](https://github.com/owen201913-cmd/claude-image)
- [0.1.0 Release](https://github.com/owen201913-cmd/claude-image/releases/tag/v0.1.0)

| 產物 | 用途 |
| --- | --- |
| `ngini-image-bridge-0.1.0-win32.mcpb` | Claude Desktop Windows x64 安裝包 |
| `ngini-image-bridge-0.1.0-source.zip` | 本版應用程式原始碼、測試、鎖定依賴、MIT 及第三方通知 |
| `ngini-image-bridge-0.1.0-native-source.zip` | 原生依賴的相符來源、授權通知與取得說明 |
| 各檔案的 `.sha256` | 實際檔案位元組的 SHA-256 校驗值 |

這些檔名保留原有套件識別，使用者介面名稱為 **Claude Image**。安裝請下載 `.mcpb`；GitHub 自動提供的 **Source code (zip)** 不能直接安裝。二進位包與相符應用及原生來源共同交付，詳見 [原生來源存取](../third_party/native/SOURCE_ACCESS.md)。

如需校驗，Windows PowerShell 可執行：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\ngini-image-bridge-0.1.0-win32.mcpb'
```

將結果與下載的同名 `.sha256` 比較；不要只依檔名判斷版本或完整性。

## 安裝與使用

需要 Windows x64、支援 MCP Apps 檔案下載的 Claude Desktop，以及標準安裝的 Edge 或 Chrome。雙擊安裝包、完成 Claude 的正常確認，再於普通聊天輸入「幫我畫：雨中的小木屋」。點結果圖片可下載原圖。基本使用不需要 API key、額外帳號、Node 或管理員權限。

每次明確要求只提交一次；逾時和交付重試查詢同一任務，不自動重生。描述盡量短，保留使用者語言與指定條件。每日免費量估計約 5–10 次，以服務當下規則為準，不保證固定額度。

## 已測範圍與限制

- 背景生成、Claude 普通聊天圖片卡片與原圖下載已有實機證據；卡片是 MCP App，不宣稱原生圖片附件。
- 本版沿用 RC12 功能實作。歷史受控測試為 **332/332 PASS、54/54 suites**；0.1.0 新建置及一項精確 UI CSP 模擬檢查通過，未重跑完整 suite 或新增真實生成。
- 只圖片回覆須另外選擇 [帳號 Instructions](image-only-setup.md)，MCPB 不會自動套用。已有一個成功圖片回合與三個必要文字控制案例，不能保證所有回合都無附加文字；Claude 自身權限與工具介面仍可能顯示。
- **乾淨 Windows 安裝、更新、重啟及移除：NOT_RUN_USER_WAIVED。** 這些項目經擁有者免測，沒有記為通過。macOS、ARM64、網頁與手機版未支援。
- 額度不足、人工驗證、網站拒絕、介面變更或登入要求會停止；不付款、不繞過限制。

完整證據與已知例外見 [本版驗收](acceptance-0.1.0.md)、[相容性](compatibility.md) 與 [只圖片回覆設定](image-only-setup.md)。

## 原始碼與授權

GitHub 原始碼由公開白名單匯出，不含使用者 profile、私人圖片、執行期紀錄、測試 Windows 映像、node_modules 或歷史安裝包。公開 README 的編輯不改變已封裝的 0.1.0 程式位元組。

程式碼採 [MIT](../LICENSE)，第三方依賴保留各自授權；不代表任何官方合作，也不保證生成圖片的商業使用權。[開發與貢獻](../CONTRIBUTING.md)
