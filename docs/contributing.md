# 貢獻與本機驗證

目前公開來源為 **Claude Image 0.1.0**，維護者為 [Yutou](https://github.com/owen201913-cmd)。GitHub 帳號與 repository 網址仍是 `owen201913-cmd/claude-image`。實際版本證據以 [正式版說明](release-0.1.0.md)、[測試](testing.md) 及 [相容性](compatibility.md) 為準；目前實機相容性證據涵蓋既有 Windows 11 x64 環境。GitHub 託管 workflow 已執行，最新結果見 [Actions](https://github.com/owen201913-cmd/claude-image/actions)，本機歷史結果不能代替託管結果。

## Windows 開發環境

使用 Windows x64、Node.js **24.19.0**、pnpm **11.19.0** 及已安裝的 Microsoft Edge。CI 固定 Node／pnpm 版本與 lockfile；一般套件 runtime 的最低 Node 版本不同，見 README。套件安裝需要網路，但以下測試不向 Ngini 生圖、不使用帳號或 API key。

在專案根目錄的 PowerShell 執行：

```powershell
npm install --global pnpm@11.19.0 --ignore-scripts --no-audit --no-fund
node scripts/github-ci-smoke.mjs
pnpm install --frozen-lockfile
pnpm run build
$env:NGINI_SESSION_BROWSER_TEST='1'
$env:NGINI_CSP_BROWSER_TEST='1'
$env:NGINI_DOM_BROWSER_TEST='1'
pnpm exec vitest run tests/unit tests/integration
pnpm run test:protocol
pnpm run verify:release
```

如果已有專用的 pnpm CLI，不必為本專案變更全域工具。可用 `node scripts/github-ci-smoke.mjs --pnpm-cli "C:\path\to\pnpm.mjs"` 指定既有 CLI 的絕對路徑（僅接受 `.mjs`／`.js` 一般檔案）。預檢以目前 Node 直接執行該檔並核對實際版本，不經 shell 拼接；後續 install／build／test 也應使用同一 CLI，例如 `node "C:\path\to\pnpm.mjs" run build`。未指定此參數時仍檢查 PATH 的 `pnpm`，供 CI 安裝固定全域版本的流程使用；版本不符會失敗，不會自動修改或安裝工具。

pnpm 的建置許可已在 `pnpm-workspace.yaml` 限定 esbuild，不要用全域 `approve-builds` 或關閉安全設定解決安裝問題。受控 Edge 測試使用臨時專用 profile、route fixture／網路阻擋；不要換成私人瀏覽器 profile。缺少 Edge 時可先跑未開 opt-in 的單元測試，但必須將未跑的瀏覽器項目標為 NOT_RUN。

## 修改與驗證範圍

修改前讀取相關程式與規則，保持變更範圍小。一次只送出一次、相同 request_id 恢復、未知提交不重送及原圖 bytes／SHA 不變是必要契約。圖片只保存在本機不算完整聊天交付；mock、協定、host 與 live 結果分開報告。

PR 說明應包含問題、最終行為、執行的指令及 PASS／FAIL／NOT_RUN，沒有執行就說明。針對行為改變加入能捕捉退化的測試；不要為改文件重跑完整 suite。一般 PR 不需要、也不授權真實提交；需要 live 驗證時，先取得明確的次數上限，逾時／未知提交仍計入，不能自動加測。

不得改用付費 API、帳號共用、代理輪換、profile 重置或驗證碼繞過。更新第三方依賴時同步 lockfile、notice、來源及原生發行審查；專案 MIT 不取代第三方授權。歷史 MCPB／ZIP 與雜湊不得覆寫，不自動建立公開 release。

## 問題報告與隱私

使用 issue 範本，只提供擴充套件／Claude／OS／瀏覽器版本、錯誤碼、階段與去識別步驟。可用 fixture 重現就不用真實提示詞。不要附完整工具 JSON、cookies、HAR、profile、私圖、完整提示詞、帳號資料或包含使用者名稱的絕對路徑。

若先前是否提交不明，先查原 request_id，不換 ID 再生成。重複卡片、重取或重下載不等於多次生成。安全／私人資料問題按根目錄 `SECURITY.md` 處理；目前未提供公開聯絡信箱或承諾回覆時間。

## CI 與依賴來源

`.github/workflows/offline.yml` 只在 push、pull_request 或手動 workflow_dispatch 執行 Windows 離線檢查，不包含發佈、MCPB 打包、真實生圖、私人資料上傳或 secrets 使用。權限只有 contents:read；checkout 不保留憑證，action 固定完整 SHA。CI 明確只跑 `tests/unit` 與 `tests/integration`，不掃描未來的 `tests/live`。

2026-10-09 由官方 release／tag 查核：

| Action | 版本／固定 commit |
| --- | --- |
| [actions/checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| [actions/setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) | `949feb2413d6458794dcd2491c4babbbce0c15c1` |

這兩個 action 使用 Node 24 runtime。自架 runner 須滿足上游要求；本 workflow 使用 GitHub-hosted `windows-2025`，其 [官方映像清單](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md) 包含 Edge。runner 映像及 Edge 會更新，所以固定工具／action／依賴不代表 OS 位元組完全可重現。修改 pin 時重新查核官方 tag 和 SHA，不從第三方範例直接抄錄。

本機可用 `node scripts/github-ci-smoke.mjs` 檢查精確工具版本、版本鎖定及 CI 安全契約；此腳本不建置、不測試瀏覽器、不連線。workflow YAML／GitHub 實際執行仍是各自的驗證層，通過本機檢查不等於 GitHub CI PASS。

歷史本機靜態驗證（2026-10-09，原紀錄未標外掛版本，不能當作 RC8 重驗）：官方 [actionlint v1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) 執行 workflow 檢查 exit 0；PyYAML 6.0.3 解析 4 份 YAML，2 份表單的 11 個欄位結構／唯一 ID／必要隱私確認檢查 PASS。當時 Node／pnpm 前置檢查 PASS；隔離副本中的浮動 action、提權 trigger 及不符 Node 版本均被拒絕（3/3）。驗證工具只暫存於本機隔離目錄，不加入套件或依賴；該次靜態檢查未執行完整建置、suite、GitHub CI、瀏覽器或真實生圖。
