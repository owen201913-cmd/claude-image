# 帳號文字指示候選：狹義圖片回覆

查核日期：2026-10-12（Asia/Taipei）。狀態：**APPLIED_HOST_SINGLE_SAMPLE_AND_CONTROLS_PASS**，本輪紀錄已封存。[追加文字](../companion-instructions/ngini-image-replies.txt) 已在授權範圍內保存；新普通聊天重開既有貓圖，這一個完成回合的嚴格只圖片為 `PASS`。來源問題、普通問答與查無任務三個控制案例均為 `PASS`。既有 Skill、MCPB 及候選文字未改，Ngini 真實提交為 0。

## 採用不同的指示載入路徑

目前官方將 `Instructions for Claude` 定義為帳號層級文字指示，會套用到所有對話；入口為左下角頭像／縮寫 → `Settings` → `Instructions for Claude`。這是預期持續提供給對話的指示，與等待 Claude 判定相關性才載入的 Skill 不同。[目前官方個人化文件](https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features)

Skill 依官方說明採漸進載入，由 Claude 判定哪些技能適合目前任務。先前伴隨 Skill 已上傳且啟用，但本次實機並未觀察到載入證據，完成回合仍附加文字；不能解讀成「已載入但規則遭忽略」。[官方 Skill 工作方式](https://support.claude.com/en/articles/12512176-what-are-skills)；[既有失敗紀錄](host-existing-cat-reopen-skill-rc12.json)

本候選改由使用者明確選擇的帳號文字指示承載同一狹義回覆規則，不再修改 tool result 或重裝同一 Skill。它仍是模型指示，不是能強制結束回合、刪除 assistant 文字或控制 host 外框的 API；官方沒有保證空文字回合或確定性。因此只有新的實機完成回合能證明這次候選是否有效。

## 不繼續舊 Style 路線

搜尋索引仍保留過去的官方 `Configuring and Using Styles`，但本次實際開啟 [舊 support.anthropic.com 文章](https://support.anthropic.com/en/articles/10181068-configuring-and-using-styles) 及 [support.claude.com 同一文章](https://support.claude.com/en/articles/10181068-configuring-and-using-styles) 均回報 404。目前個人化文件列出 Instructions、Project instructions 與 Skills，沒有 Styles 段落。

所以不能用舊搜尋快取宣稱目前 Free 帳號／此版 Desktop 有固定 Style 功能。這也不是斷言所有舊版或其他帳號永遠無此功能；本輪不製作或安裝已無現行文件可確認的 Style。

## 已授權範圍與保留規則

原需求限制不修改全域設定；此帳號文字欄位會影響所有對話，即使草稿條件刻意只作用於 Claude Image 的圖片回覆，也屬於帳號設定變更。使用者最新指示「全部你先自己弄…需要操作的使用 computer use…如需同意也代我操作我允許」已授權本候選的追加、單次試驗及失敗後撤回範圍；不是沿用先前 Skill 的同意，也不是任意帳號設定變更授權。

只追加草稿並保留使用者其他指示原樣。不得覆寫、重寫或移除既有文字，也不把私人既有指示複製到此專案、日誌或發行包。本輪實際觀察原欄位空白，因此只加入此候選規則，沒有複製私人既有指示。這份純文字不會因放進 repository／MCPB 而自動生效。

未來安裝者若選擇此方案，必須另外同意追加帳號層級指示；它會適用所有對話，不是只安裝 MCPB 即自動具備的功能。必須保留安裝者既有指示，並說明如何只移除此追加段落。本次使用者的授權不能代替其他人的選擇。

## 本輪實際結果

| 項目 | 結果與依據 |
| --- | --- |
| 本候選操作授權 | `AUTHORIZED`：追加、單次試驗及失敗撤回範圍已取得授權。 |
| 先前 Desktop 阻礙 | 歷史 `UI_BLOCKED`：Claude 最小化時，恢復操作仍回報 `user input detected`；帳號選單點擊在送出前被 minimized guard 拒絕。使用者後來還原視窗後，這項阻礙解除；先前失敗操作不計為套用。 |
| 先前替代瀏覽器路徑 | 一次 IAB 開啟官方 `claude.ai` 後停在未登入畫面。沒有輸入身分、借用 cookies 或完成登入；代理新開的分頁已關閉。這條路徑沒有保存帳號指示。 |
| 帳號保存／套用 | `PASS`：實際 Desktop `Settings → 帳號 → 給 Claude 的指示`（`conversation-preferences`）原欄位空白；加入候選全文。UIA 將 LF 正規化為空白，但全文各詞等同。點「保存變更」後再次觀察全文仍在，保存按鈕已消失。 |
| 嚴格只圖片完成回合 | 單樣本 `PASS`：新普通聊天以自然要求重開同一張既有貓圖；訊息未指定工具名，也未額外加每回合的靜默句。自動查狀態並讀取既有結果，正確貓圖可見，`document_text` 只有一個 `ngini_get_result` 卡片；出現「Claude已完成回覆」，沒有「Claude已回覆」caption heading 或模型附加正文。 |
| 控制案例 | 來源問題、普通算術、查無任務均 `PASS`，實際完整正文如下。 |
| 本輪原檔保存 | `NOT_RUN`：沒有新保存；本次卡片可見不等於新增原檔下載驗證。 |
| 既有失敗 | tool-result contract 與伴隨 Skill 的既有 `FAIL` 維持不變；Skill 實際載入仍為 `NOT_OBSERVED`。 |
| 本輪 Ngini 真實提交 | `0`。沒有新增生成。 |

圖片回合結果檢查時間為 `2026-10-11 18:29:50 UTC`（臺北 `2026-10-12 02:29:50`）；這不是操作開始時間，也不作為後續控制案例的時間戳。[公開證據](host-existing-cat-reopen-instructions-rc12.json) 不含聊天 URL、帳號身分、私人指示或截圖。

在同一普通聊天完成以下控制案例，均保留必要文字，沒有新增生成：

| 控制 | 實際要求與完整正文 | 觀察 |
| --- | --- | --- |
| 來源透明 | 問「這張圖片是由哪個網站生成的？」；答「這張圖片是由 Ngini 生成的。」 | `PASS`；沒有新增工具或卡片。 |
| 普通問答 | 問「7 加 8 是多少？」；答「7 加 8 等於 15。」 | `PASS`；沒有新增工具或卡片。 |
| 查無任務 | 要求只查 `fb77b479-098e-4e17-9e11-2a3b5c7d9f31`，找不到就說找不到，不要生成；答「找不到這個任務（request_id：fb77b479-098e-4e17-9e11-2a3b5c7d9f31），所以沒有可回報的狀態。我沒有重新生成任何圖片。」 | `PASS`；展開工具區實際看到「Ngini get status 失敗」。沒有 generate 呼叫或新的 result 卡片，原卡片仍是同一個。未讀取原始工具錯誤碼，不能宣稱已觀察到特定 `NOT_FOUND` 欄位。 |

首輪圖片試驗沒有失敗，故依授權範圍保留這份狹義帳號規則；本輪不再重跑同一提示詞。沒有新增原檔保存，新增真實提交仍為 0。

本次只證明此帳號、此回合的單樣本成功，不能宣稱 host 提供強制無文字 API、所有生成都只回圖片或跨版本穩定。舊 contract 與 Skill 的失敗仍保留；本次成功不能把它們改成通過，也不能代替乾淨 Windows P4。

## 單次零生圖額度試驗

1. 在已批准範圍內，待可用介面恢復後才追加草稿並保存；記錄實際保存／套用依據，不能只把檔案已存在或已授權當成已套用。
2. 在新的普通聊天自然要求重開一張既有圖片，沿用真實 request ID。不指定工具名，不在該訊息額外要求「不要文字」，不新增生圖。
3. 等完整 assistant 回合結束，分開記錄一張正確卡片、工具呼叫及所有模型附加文字。任一標題、描述、完成句或免責文字即為嚴格只圖片 **FAIL**。
4. 若首輪仍 FAIL，停止這個假說，不重複改寫同一欄位或重取圖尋求單次無文字。保留原始失敗證據；後續移除這份追加文字也需在已批准的回復範圍內操作。
5. 只有首輪只圖片通過後，才驗證明確來源／狀態問題、普通問答與受控錯誤仍保留必要文字。卡片可見不能替代原圖下載驗證，這些案例也不能替代乾淨 Windows P4。

本草稿保留必要錯誤、人工驗證與權限提示、明確資訊問題、來源透明；不新增生成授權，不改語言／畫面條件，不為重取另生圖。沒有宣稱較高指示優先序、host 強制靜默或跨版本穩定。
