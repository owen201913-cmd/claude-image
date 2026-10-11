# RC8 客戶端補充驗證

2026-10-10（Asia/Taipei）。此證據晚於固定 RC8 MCPB、來源 export／ZIP；不回寫封存產物，仍維持發行候選。

## 原聊天單張既有貓圖

主代理在 Claude Desktop 2.26454.2、既有 Windows 主機的原普通聊天，使用與 RC6／RC7 相同的要求及 request_id `7c1e9f4a-3b2d-4e58-9a61-d5f08b2c4e17` 重開原圖。約於 **2026-10-09 20:56–20:57 UTC**（臺北 2026-10-10），精確擷取時間未提供。人工按允許一次後，僅新增一張 `ngini_get_result` 卡片；初始較小高度穩定後預覽可見，助手已完成回覆，預覽 **PASS**。沒有新增生圖。

主代理的實際 screenshot／UI tree 觀察到以下兩段完成回覆，因此嚴格「只顯示圖片」為 **FAIL**：

> 我又用同一個 request_id 重開了一次,系統回傳的仍是原圖(貓咪蜷縮在太空船舷窗邊睡覺,1344×768),沒有生成新圖片。
>
> 不過我沒辦法確認卡片有沒有真的顯示在你的畫面上。如果你還是看不到,可能是介面卡住了,可以試試重新整理頁面,或換個視窗再開這段對話。

另有 host 思考摘要「Rechecking the result after a repeated request.」，與上述完成回覆分開記錄。本補充的寫入者沒有操作或觀察 UI；來源是主代理的實際觀察。此結果只涵蓋原聊天重開，不推定舊對話是原因，也不能代替新普通聊天或三張 fixture 回歸。

延遲人工下載確認的單一 UI 案例 **PASS**：下載確認框在 20:58:07 UTC 前已開啟，20:59:49 仍可見，等待下限 **102 秒**；沒有觀察到自動第二次下載。使用者之後按下載並回報存到桌面；約 21:02 UTC 的主代理新畫面／document text 中，確認框已關閉，圖片與正常 caption 可見，沒有 `DELIVERY_BLOCKED` 或失敗狀態。既有模型文字不變。這只證明此例的等待與後續 UI，不能證明原檔 bytes，也沒有實際觸發拋錯／中止回執分支；RC7 實機錯報的唯一原因仍未知。

主代理回報原聊天操作後、2026-10-09T21:01:43.542718 UTC 的限定任務 metadata 比較 **PASS**：仍為 **9 筆既有紀錄、0 新紀錄**。此快照早於下列新聊天與三份 fixture，不用來替代它們的事後比對。後續一次四圖檔案 verifier 於 **2026-10-09T21:21:27.815 UTC** 驗證這份貓圖的新保存原檔 **PASS**：91,506-byte JPEG、1344×768、原 SHA／full Sharp decode／stable stat 相符；這是 RC8 新證據，不沿用 RC7 下載 PASS。分項記於 [原聊天報告](host-existing-cat-reopen-rc8.json)。新增 Ngini 提交 **0 次**；原聊天預覽與原檔交付分項通過，但無額外文字門檻仍 FAIL。

## 新普通聊天單張既有貓圖

主代理先以 Ctrl+N 開新的空白普通聊天，再使用與原聊天相同的完整要求。實際 screenshot／UI tree 確認助手最晚於 **2026-10-09T21:04:42 UTC** 完成；這是時間上限，不是精確擷取戳。Claude 自動選用 `ngini_get_result`，未觀察到權限提示，一張新貓圖卡片預覽可見 **PASS**，沒有新增生圖。

完成回覆仍有下面一句，因此嚴格只顯示圖片 **FAIL**：

> 已重新開啟原圖：一隻橘白色的貓蜷縮在太空船圓形舷窗邊睡覺，窗外是紫色星雲與行星。

此例沒有原聊天的顯示狀態免責說明，但不能據此推定舊對話是先前問題的唯一原因。這是單圖 UI 驗證，為避免重複沒有再要求貓圖下載；此例沒有再做貓圖下載，既有原檔的已驗證保存事實另見原聊天案例；共用事後 metadata 比較 **PASS**，涵蓋本例與三份 fixture 讀取，不能把較早 21:01 快照用於此例。詳見 [新普通聊天報告](host-new-chat-cat-reopen-rc8.json)。

## 同一新聊天的三份既有 fixture

主代理回報接著依小／中／大三個既有 canonical request_id 受控重開；透過外層捲動逐一看到三張不同的新 TEST 卡片，預覽 **PASS**，未觀察到人工權限提示。這不是批次生成或產品一次生成三張的證據。完成回覆仍包含下列文字，因此嚴格無額外模型文字 **FAIL**：

> 三張測試圖都已重新開啟原圖，沒有生成新圖片：
> 1. 第一張：64×64 的「TEST」雜訊圖。
> 2. 第二張：1024×1024，標示「LOCAL TEST FIXTURE - NOT NGINI」的雜訊圖。
> 3. 第三張：2048×2048，同樣標示「LOCAL TEST FIXTURE - NOT NGINI」的雜訊圖。
> 工具回報三筆任務狀態都還是「presenting」，原檔下載的雜湊尚未獨立驗證。

沒有先前指令衝突的旁白，但額外文字仍存在。上述完成文字依主代理後續提供的實際 document／UI tree transcript 修正引號；預覽來源是主代理實際 UI 觀察，沒有由文件寫入者重新操作。三份 TEST 原圖的新保存檔案已由一次四圖 verifier **PASS**：小 6,822 bytes／64×64、中 3,224,337 bytes／1024×1024、大 12,859,924 bytes／2048×2048，均為正常原始檔名、fresh stat、原 SHA、full Sharp decode 與 stable stat 相符，見 [下載報告](host-original-downloads-rc8.json)。

小圖亦由使用者確認保存；主代理恢復後的實際 screenshot 顯示正常圖片、沒有錯誤狀態，下載框已關閉。cached accessibility 仍暴露舊的小圖 Download modal，因此後續 UI 狀態以新 screenshot 為依據，沒有把過期 tree 算成關閉證據。大／中圖確認後同樣觀察到正常圖片 UI，沒有 categorical DELIVERY_BLOCKED。分項見 [三份 fixture 報告](host-size-fixtures-rc8.json)。

[任務紀錄報告](host-request-state-rc8.json) 另有兩次既有比較，皆 **PASS**：原聊天 after 21:01:43.542718 UTC，新聊天＋三圖 after **21:08:18.276752 UTC**，均 **9→9**，0 ID／submitted_at／image identity SHA／source 變更。後者在全部 UI 讀取後、下載 bytes verifier 前，不是下載後新快照；本次文件合併沒有再擷取紀錄。這些 metadata 證據不代替 UI 或檔案驗證，也不證明供應商生成／剩餘額度。

[圖片回覆協定邊界](image-only-host-boundary-rc8.md) 已另行查核：外掛可控制最小 App 內容與指令，但已查核 SDK／官方資料沒有標準能力可強制 host 模型終止回覆或不寫完成文字。邊界文件已補上新普通聊天單圖與受控三圖的實測 FAIL，並記錄需要實際 host 支援的交付方式；再改一次指令本身不算解決此缺口。

## 封存來源重建補充

主代理回報 `source-build-rc8.json`：RC8 封存來源重建執行一次 **PASS**，33.251 秒；28/28 own runtime 與固定 MCPB bytes 相同，fixture stdio 8 tools 通過。這是來源可重建範圍，不是 native rebuild、乾淨 Windows 或 Claude 預覽／下載驗收；固定 export／ZIP 不因補充結果更新。
