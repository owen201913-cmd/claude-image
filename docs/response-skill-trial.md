# 獨立回覆技能試驗

日期：2026-10-12（Asia/Taipei）。伴隨技能：`ngini-image-replies`，對應 RC12 試驗。實際上傳／啟用介面 **PASS**；第一輪自然普通聊天的嚴格只圖片 **FAIL**；本次回合技能實際載入 **NOT_OBSERVED**。依原訂失敗條件停止這個假說。

這是另外上傳至使用者 Claude 帳號的可選實驗技能，不是 `.mcpb` 自動載入的檔案，也沒有取代 Claude Image、Ngini 或本機瀏覽器。它讓使用者明確選擇另一條工作流程指令載入路徑；不主張指令優先序較高，不保證 Claude 必定停止附加文字，尚不能列為已驗證的正式版解法。

草稿只包含一份純文字 `SKILL.md`，沒有程式、依賴、提示詞紀錄、圖片、帳號資料或除錯資料。上傳時這份說明會送至使用者的 Claude 帳號，並非只存在本機。

2026-10-12 上傳前審查修正：明確限制每次新生圖要求只提交一張，不把多圖要求拆成多筆生成；多筆動作規則只適用於使用者明確要求重取多張既有圖片。先前草稿 ZIP 的 SHA-256 `1e2140ca9dbb83c11d7beb525d0efbe7d6b70958ee84cfe02126151d385f8ac6` 已被修正版取代，應以目前 `.zip.sha256` 為準。這不是實機通過紀錄。

## 官方前提與安裝

官方目前列出 Free、Pro、Max、Team、Enterprise 支援技能。個人方案需要 `Settings > Capabilities` 中的 `Code execution and file creation` 已啟用；若尚未啟用，先由使用者確認這個帳號能力變更。不要自動修改設定。[官方技能使用說明](https://support.claude.com/en/articles/12512180-use-skills-in-claude)

1. 先檢閱 [技能內容](../companion-skills/ngini-image-replies/SKILL.md)，確認接受其範圍。
2. 在 Claude 開啟 `Customize > Skills`。
3. 點 `+`、`Create skill`、`Upload a skill`，選擇 `ngini-image-replies-0.1.0-rc.12.zip`。
4. 由使用者確認上傳與啟用該技能。僅建立 ZIP 不等於已安裝；只有技能已啟用才繼續實機試驗。

官方要求 ZIP 內保留技能根目錄及技能檔案；本草稿為 `ngini-image-replies/SKILL.md`。[官方技能建立說明](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)

官方也說明技能可在普通聊天及 Claude Desktop 的 Chat 分頁使用；此項產品文件不能代替目前電腦的入口或載入證據。[普通聊天平台說明](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization)

## 計畫的零生圖額度驗收

先確認技能啟用，並在新的普通聊天提出自然的既有圖片重開要求；不指定工具名稱，不在每次訊息額外要求「不要文字」。記錄技能是否實際載入，而不把已上傳或已啟用當成載入證明。

- 同一既有圖：正確選用原 request ID、一張正確圖片、沒有重複卡片；完整 assistant 回合沒有標題、描述、完成句或其他附加文字。任何附加文字即為只圖片 **FAIL**。
- 既有原圖下載：由使用者完成 host 要求的確認，保存後核對大小及 SHA-256；保存成功不能代替只圖片通過。
- 一般問答、明確詢問來源或狀態、只要提示詞：仍有正常文字回答；提示詞請求不得生成。
- 錯誤／停止：使用受控失敗或不存在的測試 request ID，確認仍回報實際錯誤、不自動重生、不隱藏人工驗證或限制。
- 若首輪正常既有圖仍附加文字，保留 **FAIL** 並停止這個假說，不重複改寫同一技能內容來宣稱修復。

本試驗不允許新增 Ngini 真實提交，不會證明新的生圖、乾淨 Windows 安裝或全模型穩定性。

## 第一輪實際結果

環境：Claude Desktop `2.26454.2`、Sonnet `5.5`、Windows 一般聊天。以下為主代理的實際 UI／UIA 觀察；此文件撰寫者沒有另行操作或觀察。詳見 [實機紀錄](host-existing-cat-reopen-skill-rc12.json)。

- 使用者確認後，上傳修正版 ZIP；技能介面顯示修正後內容，啟用開關為藍色。上傳／啟用 **PASS**，未出現能力變更提示。本次使用 ZIP 的 SHA-256 為 `f92734c5728e252307e282744ad6337f957722a67fbc1b3be52b498c2495cebf`。
- 首次新的自然普通聊天沿用既有貓圖 request ID，觀察到 `ngini_get_status` 與 `ngini_get_result`，出現一張正確貓圖卡片。預覽 **PASS**，卡片數為一。
- UIA 顯示「Claude已完成回覆」，但完成回合仍附加：「已重新顯示該圖片卡片（未重新生成）：一隻橘白色的貓蜷縮在太空船舷窗旁睡覺，窗外是紫色星雲與行星。」因此嚴格只圖片 **FAIL**。
- 沒有觀察到技能讀取工具或載入證據，技能實際載入標為 **NOT_OBSERVED**。不能由已啟用推論本回合已載入，也不能宣稱「技能規則已載入但遭忽略」。
- 新增 Ngini 真實提交為 **0**；未另存新的原圖。原圖新保存、其餘問答／錯誤案例及乾淨 Windows P4 均為 **NOT_RUN**，不能借用預覽或技能啟用替代。

依首輪失敗即停止的試驗規則，不再反覆修改同一技能或重取圖片來追求一次無文字結果。技能仍是未通過此需求的可選實驗，不能列為正式版已解決方案；技能檔與上傳 ZIP 保留原樣。
