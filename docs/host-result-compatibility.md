# Claude 圖片結果相容性

2026-10-10。RC11 恢復 RC9 已實測可呈現的結果格式：模型可見的 `request_id`、`status`、`delivery_mode` 三項事實，以及 App 專用 `_meta` 中的完整圖片卡片。原圖位元組仍走經驗證的分塊下載，不放進工具文字。

RC10 嘗試以空白 `content` 且不提供 `structuredContent` 避免補充文字。雖然固定 SDK、stdio 與受控瀏覽器測試通過，實際 Claude Desktop 2.26454.2 的新普通聊天卻顯示「收到的圖片卡片資料無效」，沒有圖片，仍附加「已重新顯示這張貓圖。」。因此 RC10 不是可用交付版。[實機紀錄](host-existing-cat-reopen-rc10.json) 保留原樣；沒有把 host inspector 的替代文字當成 raw App notification。

RC11 撤回這個不相容改動。解析器繼續驗證 own metadata、公開 request ID／status 與查詢 ID；資料損壞、身份不符及錯誤狀態不會被當成成功，也不會因展示失敗重新提交生圖。舊 RC10 frame 可能保留自身程式；更新後應沿用原 request_id 明確重開新版卡片，不生成另一張。

這個格式恢復不保證 Claude 停止輸出文字。已查核的 MCP Apps 路徑沒有本擴充套件可用來強制結束模型回合的控制；工具描述中的只圖片規則仍需要實際客戶端驗收。Claude 的工具外框與權限提示也由 host 決定。圖片卡片是最小 App 呈現，不宣稱原生附件。

RC11 已在新普通聊天顯示一張既有貓圖，另存原圖的大小、完整解碼與 SHA-256 相符；沒有重新生成。Claude 仍附加一句文字，嚴格只圖片實機 FAIL。詳見 [實機結果](host-existing-cat-reopen-rc11.json) 與 [候選驗收](acceptance-rc11.md)。乾淨 Windows、嚴格無文字及本版新生成不由歷史 RC9 成功替代。

2026-10-10 再查官方來源：固定 [MCP Apps v1.3.2 規格](https://github.com/modelcontextprotocol/ext-apps/blob/v1.3.2/specification/2026-01-26/apps.mdx#compatibility) 的 Graceful Degradation 要求即使 UI 可用也提供有意義的 content。因此 RC10「核心 SDK schema 可接受」不等於符合全部 Apps 行為規則，這不是已確認的實機失敗根因。[Claude 官方工具循環](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works#the-client-side-loop) 在工具結果回傳後繼續模型，end_turn 是模型／host loop 的停止原因，未找到本機 MCPB 可指定的靜默欄位。這是本次查核到的介面範圍，不推稱永久不可能。
