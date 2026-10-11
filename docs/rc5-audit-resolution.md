# RC5 審查修正與封存後驗證

日期：2026-10-09（Asia/Taipei）。本報告接續 [RC4 安裝審查](github-install-audit-rc4.md)，沒有改寫歷史失敗或 RC4 固定產物。RC5 MCPB 已固定；本報告是在封包後新增，未包含在該 MCPB 的文件快照內。Ngini 真實提交 **0 次**，沒有公開 repository、push 或 release。

## 修正對照

| 發現 | RC5 實作與驗證 | 邊界 |
| --- | --- | --- |
| A01 儲存失敗太晚／分類錯誤 | 提交前檢查輸出、metadata、tmp；拒絕檔案／連結路徑，執行本工具專用寫入／原子發布／清理探針；回 STORAGE_ERROR。下載既有結果重試不再提交。相關單元／整合回歸 PASS | 預檢不能保證之後磁碟／權限不變；後續錯誤仍保留原任務，不重生 |
| A02 版本及下載文件矛盾 | 中英文 README、相容性、測試及發行文件統一 RC5；區分 GitHub 原始碼 ZIP 與手動上傳的 MCPB Assets | 尚未公開，沒有真實 GitHub HTTPS 下載或託管 CI 證據 |
| A03 manifest 能力缺漏 | 7 個固定工具、tools_generated=true；正常 7／fixture 8 tools 與 manifest／版本化 App 資源核對 PASS | fixture 第八個診斷工具只在明確開啟測試模式時出現 |
| A04 平台／host 前置 | 零 native import 的 Windows x64 bootstrap；不支援平台／架構先拒絕，6 項相關測試 PASS。manifest 記錄最低已知 Claude 版本 | 新版 Claude 不等於全部已驗；host 仍需 serverTools／downloadFile；不是所有 Windows 架構可用 |
| A05 dist 殘留打包 | 自身 runtime 明確 27 檔 allowlist；未審核 dist、連結、.env.local、HAR／log 等停止打包；檢查所有 staging 檔名與自身文字 | 有限模式掃描，不能稱全面秘密偵測；第三方原生檔案另有材料與授權清單 |
| A06 瀏覽器診斷不足 | 每次啟動最多 4 筆 channel／phase／category，無 raw error、命令列、提示詞或私人路徑；相關 20 項測試 PASS | RC4 首次失敗原因仍未知。RC5 首次隔離 harness 另逾時，須保留並獨立診斷，不聲稱穩定性已修復 |

## 本輪實際通過

- build PASS；完整離線回歸 21 個測試檔、272/272 PASS，0 FAIL／SKIP，三個受控 browser flag 全開，約 20.16 秒。
- 來源 stdio、英文初始化／工具說明、fixture 原檔分塊／去重／交付狀態檢查 PASS。fixture 原檔 29,746 bytes，SHA-256 `27bf9188b1bc651b2052c9610e4bfb9206d51b07ee918290042b034a5f068ff0`。
- 精確 RC5 App HTML 嚴格 CSP、合成預覽／原檔 bytes 一致、零網路／CSP／page error PASS。HTML SHA-256 `6297d4f23095057f6b509a7a65c50cc5fa23ec3db13dd59f7e87ec6378db9f69`。這不是 Claude iframe 驗收。
- MCPB 官方 schema 及 3,533/3,533 archive readback PASS；包內檔案與 staging 一致。自身 27 個 runtime 檔，staging 有限檢查 4,850 個檔名／48 個自身文字檔。
- 開發樹外的實際 MCPB 啟動、正常 7 tools／精確 App HTML、fixture 8 tools／同 ID 原檔重取、程序重啟沿用同圖 PASS。PATH／NODE_PATH 空、資料目錄隔離，Node hook 拒絕包外檔案模組；不是乾淨 OS。
- 原生來源 companion ZIP 已建立，1,302 個檔案、405 個已核對來源輸入。原生來源取得說明及第三方授權獨立於專案 MIT，不宣稱法律認證。
- 正常 production BrowserSession 條件的開發樹外冷啟動 **3/3 PASS**，總計約 2.415 秒；Edge 154.0.4258.62、headless 與 sandbox 保留、各用獨立診斷 profile、僅載入 data: 本機頁，沒有額外 DNS／service worker 改寫。去識別 launch failures 為空。精確診斷 profile 孤兒行程清點 0，未終止其他瀏覽器。這是小樣本，不是網站生成或穩定率保證。

## 必須保留的失敗與未驗證項目

RC5 首次 `isolated-bundle-smoke.mjs` 在瀏覽器階段 80 秒逾時，整體 **FAIL**；已完成的三個 protocol／原圖／重啟檢查仍為 PASS。當時 harness 只在瀏覽器整段結束輸出結果，逾時沒有保留 attempt／phase，不能判定卡在 launch 或 cleanup，也不能把它假寫成一次已診斷的 BROWSER_UNAVAILABLE。原始機器報告保留為 `docs/isolated-bundle-smoke-0.1.0-rc.5.json`；後續診斷另存新報告。

修正的是測試程式的可觀察性：NDJSON 階段、2 秒心跳與有限診斷即時保存；逾時記錄最後進度，區分 operation／child exit，拒絕覆寫既有報告。先以額外 DNS／service worker 阻擋診斷一次 PASS，再依正常條件另測上述三次 PASS，報告為 `docs/isolated-browser-cold-starts-0.1.0-rc.5.json`。初次 FAIL 檔案 hash 保持 `c40f6bf7e8f2dc40f36685e4f8f72413cdb808a196b2073406068eac0d70959a`。**首次 runtime 逾時根因仍未知**，後續成功沒有追回已遺失的診斷；不能宣稱已找到或修復該根因。

RC5 更新畫面已準備，名稱 Claude Image、英文說明、7 tools、MIT 與版本可見；**更新安裝／原聊天既有圖下載尚未驗證**。顯示預覽不算完成安裝。

乾淨 Windows 安裝／重啟／更新／移除 **BLOCKED，未豁免**。新版新普通聊天真實生成 **NOT_RUN**，可新增 live 預算 0。歷史累計 7 次可能耗額提交、5 份不同已取得原圖、2 份內容相符，不是總共生成 7 張，也不代表剩餘額度。

## 固定候選

| 產物 | bytes | SHA-256 |
| --- | ---: | --- |
| ngini-image-bridge-0.1.0-rc.5-win32.mcpb | 18,129,989 | `cc75a84bffa9d8d9df2b4a3ec035cc511157c2fb8c8c96d9a939294705a3c4da` |
| ngini-image-bridge-0.1.0-rc.5-native-source.zip | 198,683,229 | `6223e8e8154461e3333b0c222af4854be598feaf3c02dbe1d288f4480d797bd5` |

application-source 與 GitHub clean export 由本輪凍結來源封存；固定來源檔名、建立結果與實際雜湊以候選旁 RELEASE 報告為準。本報告不包含自己的來源 ZIP hash，避免循環封存。RC5 MCPB 不覆寫、不沿用舊 hash 包裝新 bytes。

目前判定：審查發現的程式／文件缺陷已有實作與離線回歸；完整正式發布驗收 **尚未通過**。下一個驗收是實際 Claude 更新／既有原圖交付；仍須乾淨 Windows gate 及另行授權的真實新聊天驗證，並保留首次隔離逾時原因未知的限制。
