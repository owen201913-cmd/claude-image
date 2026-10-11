# RC6 客戶端補充驗證

2026-10-10（Asia/Taipei）。本頁記錄 RC6 封存後取得的證據；固定 MCPB、來源 ZIP 與 `release/RELEASE-0.1.0-rc.6` 保留 10/09 快照，未被覆寫。工作目錄的檢查器修正及本頁尚未納入固定來源 ZIP。

受測環境：Windows 11 Home x64 build 26200，Claude Desktop 2.26454.2，Sonnet 5.5，獨立 MCPB／stdio、普通聊天。這是既有主機，沒有完成乾淨 Windows 驗收。

| 檢查 | 結果 | 證據範圍 |
| --- | --- | --- |
| 已安裝 RC6 | PASS | 固定候選的 3,537/3,537 檔案位元組相符，其中 28 份 own runtime；不是安裝／更新完整生命週期 |
| 已安裝工具／卡片資源 | PASS | 隔離 stdio：7 個工具中 5 個 App 工具、2 個普通工具，visibility 與 RC6 HTML 雜湊相符；不能代替 Claude iframe 顯示 |
| T02 只要提示詞 | PASS | 新的普通聊天只回一段文字提示詞，沒有工具卡片／權限要求；9 筆既有任務及提交資訊未變，0 次新增提交。僅一個意圖案例 |
| T18 既有貓圖重開 | PASS | 原聊天以原 request_id 重取，單一新版圖片卡片，完成回覆沒有附加模型說明文字；按圖片可取得原檔 |
| T18 貓圖原檔保存 | PASS | 使用者保存到桌面後，檔案時間相對基線更新；91,506 bytes、JPEG 1344×768、SHA-256 與完整解碼皆符合工具原圖 |
| T17 小／中／大 fixture 傳輸 | PASS | 三張標示測試圖均在新版 Claude 顯示，使用者新保存的 6,822／3,224,337／12,859,924-byte 原檔皆與原圖 SHA、尺寸、完整解碼相符 |
| 三份 fixture 依序讀取的純圖片回覆 | FAIL | 三張各讀一次，但 Claude 額外解釋工具結果與使用者要求的指示衝突，並列出狀態；與單張貓圖重開 PASS 分開記錄 |
| 新版真實生成 | NOT_RUN | 本輪 live 提交預算為 0 |
| 乾淨 Windows 生命週期 | BLOCKED | 沒有第二臺 Windows／乾淨 VM，未豁免 |

貓圖原檔 SHA-256：`4d5c4344ecc1c07dec383bc7d446d43976aa9ca186147eb5b14e359753d75155`。重開及下載只沿用已取得的原圖；任務數仍為 9，原任務提交時間未變。

舊聊天已有卡片顯示「找不到連接器」，原因尚未查明；本次新呼叫能連接 RC6 並交付同一原圖，沒有證明舊卡片自行恢復。不要透過重新生圖處理舊卡片問題。

檢查器首次 FAIL 是錯誤期待普通取消工具也具有 App 資源 URI；修正為 production 實際的 5 個 App 工具／2 個普通工具後，一次隔離重查 PASS。這是檢查器修正，不是 production runtime 修正；原 FAIL 證據保留。

批次 fixture 診斷指出工具結果中的 `next_action` 行為指示與使用者要求依序讀取三張既有圖片衝突；移除冗餘指示的修正另製作新候選，不能回寫成 RC6 已修復。這個開發診斷不代表一次生成三張，也不能保證其為所有模型旁白的唯一原因。

去識別化 JSON 證據檔：`installed-rc6.json`、`installed-resource-inspection-rc6-initial.json`、`installed-resource-inspection-rc6.json`、`host-prompt-only-rc6.json`、`host-existing-cat-reopen-rc6.json`、`host-existing-cat-download-rc6.json`、`host-size-fixtures-rc6.json`、`host-fixture-downloads-rc6.json`。公開來源匯出刻意排除 docs JSON；本頁提供可隨來源保留的驗證摘要。

本輪新增 Ngini 提交 0 次。歷史累計 7 次可能耗額提交、5 份不同已取得原圖、2 份內容相符；不是網站實際總生成張數或剩餘配額。維持發行候選，沒有公開 repository 或 release。
