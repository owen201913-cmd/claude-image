# RC8 驗收狀態

2026-10-10（Asia/Taipei）。圖片回覆與下載回執修正候選；MCPB 已固定並更新至 Claude。原聊天與新普通聊天重開預覽 PASS、無額外模型文字 FAIL；受控三份 fixture 預覽也可見但有額外文字，原圖重開交付分項通過；嚴格只回圖片與完整第一版驗收仍未通過。實際證據見 [RC8 報告](rc8-audit-resolution.md) 與 [host 補充](rc8-host-supplement-20261010.md)。

| 門檻 | RC8 狀態 | 範圍／缺口 |
| --- | --- | --- |
| TypeScript／UI 建置 | PASS | 本版實際建置 exit 0 |
| 修改後來源 stdio 協定 | PASS | 正常 7／fixture 8 tools、RC8 card URI；實際文字／structuredContent 無 next_action 或私密欄位，同 ID fixture 原圖 SHA／身分及恢復防護通過，見 protocol-smoke-rc8-download.json；不是 MCPB 或 Claude host |
| 下載回執 production mock DOM | PASS | 21/21；10 分鐘明確 timeout／AbortSignal、已知錯誤與未知保存結果分開，不自動重下載或重送；不是實機回執驗收 |
| 完整受控回歸 | PASS | 三項受控 browser flags 全開，一次 22 files／305/305，0 failed／pending／todo／skip，raw JSON 起訖 36.071 秒；不是 live 網站或 Claude host |
| 封包 schema／archive 讀回 | PASS | 官方 schema、3,543 files 與 stage 相符、安全路徑／CRC／包外解壓；初次舊 RC6 CSP 報告關聯 FAIL 保留，改用精確 RC8 suite 證據後第二次 PASS |
| Strict-CSP 產物關聯 | PASS | 精確 RC8 suite zero-height synthetic-host 報告與 dist／MCPB HTML 相符，沒有重跑 CSP；不是實機 |
| 包外 protocol／fixture／重啟 | PASS | 實際 MCPB 一次 protocol-only；正常 7／fixture 8 tools、同 ID 原圖／重啟、344 個包內模組，0 包外；browser NOT_RUN |
| 原生來源伴隨包 | PASS | 1,302 files CRC／讀回、405 選定來源輸入；不是 native rebuild 或授權認證 |
| 已安裝候選／隔離 stdio 資源 | PASS | 3,543 files bytes／SHA 相符，runtime 28／native 材料 887；installed bootstrap 的 UI8 HTML、5 App／2 普通 tools 核對，0 新任務；不是普通聊天顯示／下載 |
| Application／GitHub 來源 ZIP | PASS | 1,011 files、2,555,635 bytes；兩份 ZIP bytes 相同，manifest／完整 inventory／bytes／安全路徑／CRC 通過，見 source-inspection-rc8.json |
| 封存來源新資料夾重建 | PASS | 本版一次 33.251 秒；28/28 runtime 與固定 MCPB bytes 相符、fixture stdio 8 tools；不是 native rebuild／乾淨 Windows |
| T02 只要提示詞 | NOT_RUN | RC6 實機單一案例為歷史 PASS，新版未驗 |
| 原聊天單張既有圖片預覽 | PASS | 同一 request_id／原圖，一張新卡片在初始小高度穩定後可見；主代理實際 screenshot／UI tree |
| RC8 四份既有原檔新保存 | PASS | 21:21:27.815 UTC 單次限定 verifier：一份 Ngini 貓圖及小／中／大 TEST 共 4/4 exact normal filenames fresh、原 bytes／SHA、full Sharp decode／stable stat PASS，見 host-original-downloads-rc8.json；不是新生成 |
| 既有圖重開後任務 metadata | PASS | host-request-state-rc8.json 有原聊天與新聊天＋三圖兩次既有比較；皆 9→9、0 ID／submitted_at／image identity SHA／source 變更。後者 21:08:18.276752 UTC，覆蓋全部 UI 讀取、早於下載 bytes；沒有新增快照 |
| 延遲人工下載確認 UI | PASS | 一次實機：確認框保持可見至少 102 秒，人工保存後約 21:02 UTC 框已關閉、卡片無 DELIVERY_BLOCKED／失敗文字；未觀察自動第二次下載。不是原檔 bytes 驗證 |
| 實機拋錯／中止時未知回執分支 | NOT_RUN | production mock DOM PASS，不能替代此分支實機驗收 |
| 原聊天圖片要求不加模型文字 | FAIL | RC8 完成回覆仍有兩段說明；host 思考摘要另記，舊對話因果未證明 |
| 新普通聊天既有單圖重開 | FAIL | 一張預覽 PASS、自動 ngini_get_result；仍加一句場景描述，嚴格無文字 FAIL。此案例沒有另做貓圖下載，見 host-new-chat-cat-reopen-rc8.json |
| 三份既有 fixture 受控重開 | FAIL | 主代理分別看到三張 TEST 預覽 PASS；完成回覆仍有項目與狀態說明，無文字 FAIL。三份原圖 fresh bytes／SHA／完整解碼及共用讀取後 metadata PASS；不是批次生成 |
| 新普通聊天真實生成／語意準確 | NOT_RUN | live 預算 0 |
| T20 新版有限來源／封包檢查 | PASS | 本版 1,087 first-party files、0 項所掃描模式發現及 archive 讀回；不是全面秘密保證 |
| T20 實機日誌隱私 | NOT_RUN | 新版已安裝，完整客戶端日誌驗收未執行 |
| 乾淨 Windows 完整生命週期 | BLOCKED | 未豁免、沒有受測環境 |
| 公開 repo／release／託管 CI | NOT_RUN | 未授權公開 |

不重新生成既有圖；逾時／未知提交仍沿用原 request_id。下載回執未知不等於保存失敗，不自動再開下載確認。固定歷史產物不覆寫；305/305 為 RC8 受控測試，仍不能代替普通聊天或真實生成。

固定 RC8 export／來源 ZIP 的文件早於安裝、來源重建及 host 補充，保留封存快照；本頁更新不改寫固定產物。原聊天延遲確認、新聊天及三圖預覽／模型文字結果另記；四份既有原檔 fresh bytes／SHA／解碼及兩次 metadata 比較均 PASS；仍保留無額外模型文字 FAIL。已查核協定沒有強制抑制 host 完成文字的標準能力，見 [圖片回覆邊界](image-only-host-boundary-rc8.md)。
