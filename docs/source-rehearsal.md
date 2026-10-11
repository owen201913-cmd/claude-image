# 隔離來源演練

這項演練驗證「凍結的來源包能否在新的專案資料夾及依賴 store 建置、測試及打包」。它使用現有 Windows、Node.js 與 pnpm，不代表乾淨 Windows 或 Claude 安裝驗收。沒有操作 Claude、瀏覽器、私人 profile 或 Ngini，也沒有新增真實生成。

## 目前來源建置與歷史演練的差別

目前候選是 RC6。取得同版 `ngini-image-bridge-0.1.0-rc.6-source.zip` 與相鄰 `.sha256`，驗證後解壓至新資料夾；使用 packageManager 指定的 pnpm 執行 `pnpm install --frozen-lockfile`、`pnpm run build`。來源包不含既有 node_modules、dist 或 native 快取。完整 `package` 還需要依 [native 材料說明](../third_party/native/README.md) 準備指定材料，不能只解壓 application-source 就宣稱可完成整包打包。

RC6 的本機窄重建驗證使用新 store、鎖定安裝、build、28個自有 runtime 與固定MCPB逐位元比較及fixture stdio；刻意不重複完整suite，也不執行 package/native 重建。結果見候選旁固定 RELEASE 報告與 `docs/source-build-rc6.json`，不代表乾淨Windows。

以下只保留 DEV.15 歷史執行方法。需搭配當時相符版本的專案，不能在目前RC6 checkout直接重跑；`source-rehearsal.mjs`要求來源與執行腳本的專案版本一致，且尚未提供自動還原目前native快取的完整演練路徑。腳本是後續新增工具，不宣稱存在於原本DEV.15 ZIP。歷史參數中的pnpm位置應換成當時已安裝的工具：

```powershell
node scripts/source-rehearsal.mjs --pnpm-cli "<existing-pnpm>/bin/pnpm.mjs" --source-zip "release/ngini-image-bridge-0.1.0-dev.15-source.zip"
```

本次使用 Node.js **24.19.0**、pnpm **11.19.0**、Windows x64，以及 Windows PowerShell/.NET ZIP 解壓功能。開發工具要求與外掛執行期要求不同；僅滿足外掛的 Node 最低版本並不足以執行全部開發相依。

腳本會：

1. 比對來源 ZIP SHA-256，檢查壓縮檔路徑、連結、重複項目及大小上限後解壓。
2. 在 `.runtime/sr-*` 建立新 store、空白使用者及全域 npm 設定檔、暫存目錄與獨立工具資料目錄。不複製現有 `node_modules`、`dist`、profile 或圖片。
3. 執行 `pnpm install --frozen-lockfile --store-dir <isolated-store>`，保持供應鏈及完整性檢查；只允許專案已核准的 `esbuild` 相依建置腳本。
4. 建置、執行完整預設離線測試集合、來源 fixture stdio 測試及來源發行掃描。
5. 在隔離副本內以官方 MCPB CLI 驗證、打包，再從解壓的候選包執行 fixture stdio 測試。
6. 比較重建包與正式凍結候選的全部自有 JavaScript/HTML 執行檔路徑及 SHA-256。

相依下載只使用一般 npm registry。本次安裝上限 240 秒，其他步驟有個別逾時；逾時只停止這次啟動的程序樹。失敗不會改全域設定、解除供應鏈限制或改用既有 store。Windows 長路徑解壓使用檔案 API 前綴，不修改登錄或系統政策。

## 實跑結果

2026-10-09 06:59:50–07:00:49（Asia/Taipei），總耗時 **59.4 秒**，來源 `0.1.0-dev.15`：

| 項目 | 實際結果 |
| --- | --- |
| 來源 ZIP | 2,339,763 bytes；976 entries；SHA-256 `3a91df0b1c5058c048ce7f9b5637c59e685a6175fb9ed9d97ed0b9a1a72c4298` |
| 新 store 安裝 | PASS；191 downloaded、0 reused；只有 `esbuild` postinstall；6.1 秒 |
| 鎖定檔 | 安裝前後 SHA-256 相同，沒有重新解決或改寫版本 |
| 建置 | PASS |
| 預設完整離線集合 | 18 files；**191 PASS、23 SKIP、0 FAIL**。23 項需要已安裝瀏覽器，這次刻意不啟用 |
| 來源 stdio／fixture | PASS；7 tools；原圖 29,746 bytes，SHA-256 `27bf9188b1bc651b2052c9610e4bfb9206d51b07ee918290042b034a5f068ff0` |
| 來源發行掃描 | PASS；972 files；僅代表腳本列出的路徑及模式檢查 |
| 隔離 MCPB schema／pack | PASS；99 runtime packages |
| 解壓候選 stdio／fixture | PASS；7 tools；同一原圖 bytes／SHA-256 |
| 自有執行檔重建 | **24/24 路徑與 bytes 相同**，與凍結 DEV.15 MCPB 比對 |
| 真實 Ngini 提交 | **0** |

這只證明上述自有執行檔可重建；沒有宣稱整個 ZIP 位元組或所有依賴檔案都已逐一比對。隔離新包留在 `.runtime`，沒有替換正式候選包。最初兩次腳本嘗試分別遇到 Windows 解壓長路徑、PowerShell 進度輸出解析問題，均在開始安裝前失敗；修正後完成上述一次完整演練，失敗紀錄仍保留。

## 證據與未驗收範圍

腳本將私有步驟日誌及測試結果留在 `.runtime/sr-*`，摘要存為 `docs/source-rehearsal-*.json`；這些檔案均由 `.gitignore` 排除。可公開的本文不包含本機絕對路徑。成功摘要為 `source-rehearsal-2026-10-08T22-59-50-362Z-893cbf32.json`。

以下仍為 **NOT_RUN**：乾淨 Windows 上安裝 Node/pnpm、乾淨 OS 的安裝／更新／重新啟動／解除安裝、實際 Claude 卡片與原圖存檔、已安裝 Edge 的 23 項瀏覽器測試，以及 native 相依從原始碼重新建置。本次也沒有重做 Ngini 端到端或修改既有真實提交預算。

需要清理時，關閉這次演練後，僅刪除摘要指定的 `.runtime/sr-*` 演練目錄；保留正式 `release` 產物及使用者原圖。本腳本不自動清除演練證據。
