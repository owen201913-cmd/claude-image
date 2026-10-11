# RC7 驗收狀態

2026-10-10（Asia/Taipei）。RC7 是工具結果指示衝突修正候選；實際執行見 [RC7 報告](rc7-audit-resolution.md)。RC6 實機證據見 [補充](rc6-host-supplement-20261010.md)，不能自動替代新版驗收。

| 案例／門檻 | RC7 狀態 | 依據／缺口 |
| --- | --- | --- |
| T01／T03／T05 新普通聊天真實生圖 | NOT_RUN | live 預算 0，未重送 |
| T02 只要提示詞 | NOT_RUN | RC6 一個真實案例 PASS；新版未驗 |
| T04 明確條件／語意準確 | NOT_RUN | 不把短貓圖成功當作所有複雜條件通過 |
| T06–T16／T19 去重、錯誤、下載及注入受控測試 | PASS | 本版完整受控 301/301；不是新版 live 網站或通用注入安全驗收 |
| T17 小／中／大 fixture 預覽 | PASS | 本機普通聊天三張標示 TEST 的預覽可見；不是 Ngini 生圖 |
| T17 fixture 原檔新保存 | FAIL | 首次核對大圖 SHA／解碼 PASS；小圖及一般圖未找到新保存證據，不代表檔案損壞。見 host-fixture-downloads-rc7.json |
| 圖片回覆不加模型文字 | FAIL | 批次加一句確認；原聊天單張貓圖重開也加說明。不能保證只回圖片，見 rc7-host-supplement-20261010.md |
| T18 既有貓圖原聊天預覽 | PASS | 一次 get_result 重開原圖；沒有重新生成。原檔保存見下一項 |
| T18 貓圖原檔新保存 | PASS | 原始 Ngini 檔名的新保存檔，91,506 bytes、SHA／1,344 × 768／完整 JPEG 解碼相符，見 host-existing-cat-download-rc7-original-name.json。先前要求 RC7-cat.jpg 未找到的 FAIL 報告另行保留 |
| 卡片原檔下載狀態正確性 | FAIL | 人工下載確認數分鐘後，卡片仍以 DELIVERY_BLOCKED 斷言下載未完成，與已驗新保存原檔矛盾；原因待查，不影響原檔 bytes PASS |
| T20 來源／封包有限檢查 | PASS | 有限 first-party 來源掃描；MCPB 路徑／自有文字與 archive==stage 讀回，不是全面秘密保證 |
| T20 實機日誌隱私 | NOT_RUN | 本版已更新，但沒有完整客戶端日誌隱私驗收 |
| T21 乾淨 Windows 安裝／重啟／更新／移除 | BLOCKED | 沒有可用受測環境，使用者未豁免 |
| T22 獨立 MCPB 安裝檔案／資源 | PASS | 3,540/3,540 installed files 等於固定 RC7；隔離 stdio 資源版本及 5 App／2 普通工具核對，不等於普通聊天顯示／下載 |
| T22 普通聊天實際圖片交付 | FAIL | 本版實際更新，貓圖預覽／新保存原檔 PASS；額外模型文字及卡片錯誤下載狀態 FAIL，fixture 保存分項如上，完整門檻未通過 |
| 公開發行／託管 CI／HTTPS 下載 | NOT_RUN | 未授權公開 |

一次生成一張、防重複及未知提交不重送由程式保證其本機邊界；Ngini 沒有因此提供 exactly-once 保證。工具回傳成功、iframe preview 回報或 host 接受下載，都不等於使用者已保存原圖。
