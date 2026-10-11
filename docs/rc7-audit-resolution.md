# RC7 工具結果修正與驗證

2026-10-10（Asia/Taipei）。RC7 仍為發行候選，正式驗收尚未通過；固定 RC6 產物及報告保留原狀。

RC6 實機已完成安裝檔案核對、普通聊天只要提示詞、單張貓圖重開及原檔保存、小／中／大 fixture 傳輸。三份 fixture 依序讀取時，Claude 指出工具結果要求提前結束與使用者要求衝突，並附加說明文字。精確範圍及失敗見 [RC6 客戶端補充](rc6-host-supplement-20261010.md)，不能寫成 RC7 已重驗。

RC7 移除工具文字與 structuredContent 中冗餘的 `next_action` 行為指示；初始化與工具說明仍承擔行為規則。結果採白名單投影，保留任務狀態、來源、額度、供應商圖片數、錯誤、交付模式與原圖 metadata。App 不使用該指示欄位；瀏覽器、提交、去重、取消與原檔下載邏輯未修改。此修正處理具體衝突，不保證 Claude 在所有情境都不加文字。

| 本版檢查 | 狀態 | 範圍 |
| --- | --- | --- |
| 聚焦投影／交付協調測試 | PASS | 10/10，實際 production 投影排除行為／私密紀錄欄位，保留來源及真實狀態 |
| TypeScript／UI 建置 | PASS | 明確 Node 24.19.0／pnpm 11.19.0，exit 0，沒有更新依賴版本 |
| 完整離線回歸 | PASS | 22 files、301/301 tests、0 failed／skip；三項受控 browser flags 全開，24.07 秒 |
| 實際 stdio 協定 | PASS | 正常 7／fixture 8 tools；實際文字 JSON 及 structuredContent 不含 next_action／私密紀錄，fixture 原圖與同 ID 重取一致；不是 Claude host |
| MCPB schema／archive 讀回 | PASS | 官方 MCPB schema；3,540/3,540 files 與固定 stage 位元組一致、CRC／安全路徑及包外解壓；不是 Claude host 驗收 |
| 包外 protocol／fixture／重啟 | PASS | 實際 MCPB、正常 7／fixture 8 tools；原圖雜湊、同 ID 去重、重啟重取與 344 相依模組均在包內；`--protocol-only` 跳過 browser，明確 NOT_RUN |
| application／GitHub 來源 ZIP | PASS | 1,008 files，2,539,265 bytes；來源 manifest、精確 bytes、CRC、安全路徑、無 private runtime／links 與有限模式掃描相符；兩份 ZIP 位元組相同 |
| 原生來源伴隨包 | PASS | 1,302 files，198,683,229 bytes，405 個選定來源輸入核對；來源／授權原文與替換指引保留。未確認獨立授權的 build recipe repository 僅連結，不重新散布；不是 native rebuild 或法律認證 |
| 封存來源新資料夾重建 | PASS | 空 pnpm store、沒有既有 dist／node_modules、child environment 白名單；Node 24.19.0／pnpm 11.19.0 frozen install，鎖檔不變；28/28 runtime 與 MCPB 逐位元組相同，fixture stdio 8 tools PASS，21.153 秒 |
| RC7 Claude 普通聊天 | FAIL | 已更新；三份 TEST／單張既有貓圖預覽 PASS，指示衝突旁白消失；單張及批次仍有額外模型文字。首輪大圖新保存 PASS，小／中圖缺少新保存證據；後續見 rc7-host-supplement-20261010.md |
| RC7 真實生成 | NOT_RUN | live 預算 0 |
| 乾淨 Windows 生命週期 | BLOCKED | 未豁免 |

已安裝資源檢查器改正為 5 個 App 工具／2 個普通工具。新增隔離 harness 的 `--protocol-only`，與瀏覽器專用參數互斥；跳過的瀏覽器明確標為 NOT_RUN，不製造冷啟動通過結果。

本輪新增 Ngini 提交 0 次，沒有公開 repository 或 release。MIT 為專案授權；第三方通知及原生來源取得條件另附，不宣稱法律認證。

有限來源掃描 PASS：1,084 份白名單 first-party source/docs，0 項所掃描 token／私鑰／開發者 home 路徑模式發現；不是第三方 binary 或通用秘密保證。JSON 證據為 `offline-tests-rc7.json`、`protocol-smoke-rc7.json`、`release-audit-rc7.json`，公開來源仍只保留 Markdown 摘要。

固定 MCPB 為 18,150,580 bytes，SHA-256 `58d2796b6663759774979bbd3fe880069214e7155b8b55ac3bf1571059a1024b`。封包保留打包當下文件快照；本頁後續驗證是補充證據，不回寫已封存的 MCPB。

application-source 與 github-source 同為 2,539,265 bytes、1,008 files，SHA-256 `49ee1f9210651f83dbc4a8756598ae2e762f91531c106bf94faf16f76c6bfd13`；固定來源 export manifest 的 SHA-256 為 `507b153a5676871385ed5fe924f3834e812bed14b155ca8edc0229560fa3b2e2`。native-source 為 198,683,229 bytes、1,302 files，SHA-256 `11bd3c062221a1b20bbffc7c22498dbd9f10e70011215f35d474bb32ce9d1e45`。每份 ZIP 與 MCPB 均有相鄰 `.sha256`，沒有為補充驗證重新打包或輸出來源。

來源／原生來源讀回及新資料夾重建證據分別為 `source-inspection-rc7.json`、`native-source-inspection-rc7.json`、`source-build-rc7.json`。來源重建只做一次；新資料夾與空 store 在同一臺開發 Windows，不等於乾淨 Windows、原生相依重新編譯、GitHub HTTPS 取得或託管 CI。固定 MCPB 與來源 export／ZIP 都早於本段補充驗證，包內說明及來源文件仍是各自封存時的快照；補充結果記於本頁與 `release/RELEASE-0.1.0-rc.7.json`／`.md`。

文件審查確認自有包內相對連結目標完整。搬入通知資料夾的 upstream `defmt-parser` README 仍以 `../LICENSE-*` 連結授權；實際 LICENSE-APACHE 與 LICENSE-MIT 已在同一資料夾，應直接開啟。保留 upstream 檔案與雜湊，未將這個閱讀連結問題宣稱已修正；不影響包含授權原文。
