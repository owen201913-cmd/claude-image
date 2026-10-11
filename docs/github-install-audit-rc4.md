# Claude Image RC4：GitHub 下載安裝審查

查核日期：2026-10-09（Asia/Taipei）。對象為 `0.1.0-rc.4` 固定產物及目前來源；本輪只審查、加入隔離診斷與報告，未修改產品程式、重新封包或公開發布。Ngini 真實提交 **0 次**。

## 判定

**已有真正可安裝的 Windows x64 MCPB 候選包，但目前不通過「一般使用者從 GitHub 直接下載、照文件即可可靠使用的正式版」驗收。**

只上傳原始碼不會自動得到可安裝外掛。GitHub 的 **Code → Download ZIP** 及自動產生的 **Source code (zip)** 是原始碼，並非 MCPB。正確的使用者路徑是從 GitHub Releases 的 **Assets** 下載特定版本 `.mcpb`，核對同版 SHA-256，再雙擊或拖入 Claude Desktop 完成人工安裝／權限確認。[GitHub Releases 官方說明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)、[Claude MCPB 官方安裝說明](https://claude.com/docs/connectors/building/mcpb)。

本案使用獨立 MCPB 桌面擴充套件，不需要把 Claude Code plugin 當作一般聊天的安裝方式。GitHub 公開原始碼、GitHub 發布安裝包、Claude 官方目錄上架是不同動作；目前三者均未由本輪執行。

## 受查核產物

| 產物 | bytes | SHA-256 |
| --- | ---: | --- |
| `ngini-image-bridge-0.1.0-rc.4-win32.mcpb` | 18,110,435 | `78ee954a613d05bb31c6369fcff49f29338b5975d4ed8df50f141f3ab0302d91` |
| `ngini-image-bridge-0.1.0-rc.4-source.zip` | 2,492,958 | `2a9eef3e79beb0180e3f4c96ea4a4d75a72fb3cb637384cfb08aa29032627792` |
| `ngini-image-bridge-0.1.0-rc.4-native-source.zip` | 198,683,229 | `8bee208f3bb37546983ca7ef2b46c0b05c5b38182033ab90d0eb1d2ad619a949` |

以上是本機固定產物，不是已公開可下載的網址。此報告及本輪診斷是在封存後新增，未包含在上述 RC4 source ZIP／MCPB 中。不得改寫固定 ZIP 後沿用原 SHA。

## 已確認的成立部分

| 檢查 | 結果 | 證據與範圍 |
| --- | --- | --- |
| MCPB 官方 schema、3,524 檔封包完整性 | PASS | RC4 封包時檢查，與 staging 原始位元組一致。不是新 Windows 安裝驗收。 |
| RC4 在本機 Claude 更新 | PASS | 使用者完成更新；3,524/3,524 安裝檔與固定包一致，畫面顯示 Claude Image 與英文說明。 |
| 開發樹外啟動 MCP | PASS | 本輪把同一 MCPB 複製、解壓到 Windows TEMP 獨立目錄；祖先沒有 node_modules；子程序 PATH／NODE_PATH 為空。正常 7 tools，fixture 8 tools。 |
| 開發樹外依賴隔離 | PASS（限定範圍） | Node resolve hook 拒絕包外檔案模組，實際記錄 341 個不同包內模組；不涵蓋 Windows 系統 DLL／原生共享函式庫。 |
| 打包 App 資源 | PASS | stdio 讀取版本化資源，HTML SHA 與包內 HTML 相同。不是實際 Claude UI 顯示測試。 |
| fixture 原圖、同 ID 與重啟恢復 | PASS | 本機標示測試圖 29,746 bytes，960×640；原檔分塊雜湊相同；同 ID 重取及伺服器重啟後沿用同一圖片，未假報 delivered。不是 Ngini 圖片。 |
| RC4 有限私密檔案檢查 | PASS（限定範圍） | 封包檔名及 25 個自身編譯文字檔，未見本輪所檢查的 profile、Cookies、HAR、log、.env、主目錄絕對路徑或有限金鑰樣式；不是全面秘密或隱私保證。 |
| 隔離條件下瀏覽器啟動 | FAIL 後 PASS；原因未明 | 實際 BrowserSession 第一次報 BROWSER_UNAVAILABLE；後續直接 Playwright 及同條件 BrowserSession 診斷均成功開啟 Edge 154.0.4258.62 的本機 data: 測試頁。不得只報後兩次 PASS 或宣稱已修復。 |
| 真實背景生成、原聊天原圖交付 | 本輪 NOT_RUN | RC2 曾完成一次真實生成、預覽、原圖雜湊及解碼；RC3 曾完成既有圖重開。RC4 只有更新／套件與本機測試證據，沒有新的真實 E2E。 |
| GitHub 實際 HTTPS 下載 | NOT_RUN | 未公開 repository／release；本輪使用本機資產副本，不能冒稱 GitHub 下載通過。 |
| 乾淨 Windows 安裝／重啟／更新／移除 | BLOCKED | 無第二臺 Windows 或乾淨 VM。使用者選擇等待，未豁免。相同 OS 的隔離資料夾不能取代此驗收。 |

測試環境是既有 Windows 11 Home x64 build 26200、明確指定的既有 Node 24.19.0、既有 Edge。Claude 版本為 2.26454.2；本輪隔離子程序不是由 Claude 內建 Node 啟動。實際系統相依仍可能存在。

原始單一隔離測試腳本在最後瀏覽器階段 exit 1；之前的循序 assertions 已完成，沒有產生整體 PASS。後續報告保存這項失敗、兩個診斷成功及保留下來的 fixture 檔案雜湊，沒有重做真實生成。機器可讀診斷存於本機 `docs/direct-download-portability-rc4.json`；依現有匯出規則，JSON 診斷不會自動隨公開原始碼匯出。

## 發現與修正要求

### A01 — P1：輸出資料夾失敗在提交後才發現，且錯誤分類錯誤

`src/jobs/runner.ts:168` 先呼叫 submit，178 下載，183 才 `images.save`。`src/images/image-store.ts:50` 的 metadata mkdir 又在 59 開始的 try 外，因此本機檔案錯誤被 runner 的 `errorInfo(error, 'UI_CHANGED')` 誤分類。

本輪離線 probe 把 outputDir 指向已存在的普通檔案：mock open／submit／wait／download 各 1 次，結果 `failed / UI_CHANGED`、沒有 image，已有提交 journal；Ngini 真實提交 0 次。這證明可預先發現的本機儲存問題也會在可能消耗額度之後才失敗。受 ACL／防護軟體阻擋的實機條件未另測，不把本例推稱那些條件已測通。

修正要求：在提交前驗證工具資料／輸出位置可安全建立、寫入並清理本工具暫存檔；將儲存初始化錯誤納入 STORAGE_ERROR；保留提交後失敗不重送的規則。預檢不能保證之後永遠可寫，提交後仍須處理磁碟／權限變化。probe 位於本機 `.runtime/output-path-probe`，1/1 離線測試通過，表示缺陷重現成功，**不是功能已修復**。

### A02 — P1：公開下載文件仍指向舊版，沒有完成使用者下載路徑

`README.md:7,14` 與英文版仍寫目前 RC3、舊 MCPB 名稱／SHA、安裝 NOT_RUN；`docs/github-preparation.md:3` 甚至仍以 RC1 為目前版本。`docs/compatibility.md` 及 `docs/release-candidate.md` 也有過期的「最新／目前」判斷，與 RC4 段落互相矛盾。僅加上一個 RC4 前言不足以讓使用者判定應下載哪個檔案。

`.gitignore` 排除 dist、release、mcpb、zip；`scripts/export-github.mjs` 也明確只匯出來源。`.github/workflows/offline.yml` 只建置／測試／審查，沒有打包或發布 Assets。**沒有自動發布 workflow 本身不是 bug**，但必須明確採人工 Release 附檔，不能假設上傳來源後 GitHub 自動產生外掛。

修正要求：統一中英文 README 與相容性／候選版文件，區分 RC4 安裝、歷史 RC2 E2E、RC3 重開及未測項目；完成 Releases 安裝包、同版 SHA、下載與雙擊安裝步驟。實際 URL 只有在擁有者授權並真的發布後才能填為可用，不可預造下載連結。

### A03 — P2：manifest tools 宣告與實際能力不同

manifest 只列 5 tools；正常伺服器實際列 7，另有 `ngini_read_image`、`ngini_report_delivery`，而且沒有 `tools_generated: true`。fixture 設定還會增加診斷工具。官方規格將額外動態能力標記預設視為 false。[MCPB manifest 官方規格](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md#dynamic-generation)。

這是能力 metadata 缺漏，**不是已證明導致目前 Claude 安裝失敗**；RC4 實際更新成功。修正要求：完整宣告固定工具，並正確宣告設定造成的動態能力。

### A04 — P2：x64 與圖片交付能力沒有充分反映在相容性門檻

RC4 原生 Sharp 包只有 Windows x64；manifest 只寫 win32，packager 也只檢查 platform。原生 ARM64 Node 會在 import Sharp 時失敗，尚未有友善的架構檢查。README 已說 ARM64 未支援，因此不能宣稱所有 Windows 可用；這裡是安裝／啟動拒絕條件不足。

圖片原檔下載另外依賴 MCP App host 的 `serverTools` 與 `downloadFile`。`src/ui/image-card-client.ts:154,174` 已在缺能力時阻擋下載，但 manifest 沒有 Claude 版本限制，僅 Node 版本符合不代表一般聊天能交付原檔。修正要求：明列 Windows x64、已實測 Claude 版本、Edge／Chrome 標準安裝前置，並對不支援架構／客戶端提供明確錯誤；不要將所有較新版本或其他 Claude 平台都推稱已驗證。

### A05 — P2：未來打包可能帶入 dist 殘留檔

`scripts/package.mjs:116` 遞迴複製 dist，只排除 map／test.js；143 的檢查只拒絕精確 `.env`，未涵蓋 `.env.local`、debug log／HAR／其他不必要檔案。`scripts/release-audit.mjs` 掃來源但不掃 dist。

本輪 RC4 實際有限封包檢查沒有發現私密檔案，**不把未來污染風險說成現有資料外洩**。修正要求：自身編譯產物採明確清單或隔離乾淨建置，封包最後再檢查所有實際帶入檔案，而不只檢查來源。

### A06 — P2：第一次瀏覽器啟動失敗的診斷不足

`src/browser/session.ts` 嘗試 Edge／Chrome 後只回通用 BROWSER_UNAVAILABLE；本輪第一次隔離啟動的原始 channel 原因未保存，後兩次成功不能倒推出第一個原因。修正要求：在限定本機診斷中保留去識別的 channel／階段／錯誤類別，不記錄 cookies、提示詞、完整網頁或私人 profile 路徑；實際原因未確認前維持未解決，避免無依據宣稱穩定。

## 發布前的獨立驗收缺口

- **乾淨 Windows gate 未通過且未豁免。** 修正上述程式／文件後，仍需在有 Claude Desktop、標準安裝 Edge／Chrome、沒有開發環境與私人資料的受測 Windows x64 上測安裝、重啟、更新、移除及聊天原圖交付。沒有受測環境時維持候選版。
- **公開二進位來源存取未驗證。** 依專案既有 `third_party/native/SOURCE_ACCESS.md`，同版 application-source、native-source、SHA 與實際來源取得說明須伴隨二進位發行。MIT 不取代第三方授權。198,683,229-byte native ZIP 超過一般 Git 檔案 100 MiB 限制，應以 Releases 等適合大型檔案的方式分發；不能直接把它當一般來源提交。[GitHub 大型檔案說明](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。本審查不是法律認證。
- **新版完整 Claude E2E 未另測。** 現有真實樣本有價值，但不得把跨版本證據寫成 RC4 新聊天全程通過；後續修正須依改動範圍驗證。額度授權已用完，本輪未新增真實提交。

## 後續順序

1. 修正 A01 與錯誤分類，補一個有意義的離線回歸測試。
2. 統一版本／安裝文件、manifest 能力、x64／App 相容性與安全打包條件。
3. 對新候選包驗證實際 bytes、正常與 fixture stdio、既有圖片／原檔交付；保留此次失敗樣本，不覆寫 RC4。
4. 有乾淨 Windows 環境後完成 P4；之後由擁有者決定公開來源及 Release Assets。

因此本次結論是 **審查完成、正式發布就緒驗收未通過**。不能用 MCP 能啟動、fixture 成功或本機已安裝取代未完成的使用者驗收。
