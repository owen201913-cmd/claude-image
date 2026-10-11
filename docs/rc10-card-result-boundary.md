# RC10 空白公開成功結果與卡片邊界

2026-10-10（Asia/Taipei）。目前候選為 `0.1.0-rc.10`；建置、328/328 受控回歸、封包協定及安裝核對通過；實際普通聊天重開貓圖則沒有預覽並出現卡片資料無效，仍附加完成文字。本頁記錄候選實作與失敗邊界，不宣稱 Claude 已停止附加文字。

## 結果與解析

只有 App 模式、存在有效圖片資料、狀態為 `image_ready`／`presenting`／`delivered`，且沒有 error、query_error、耗盡額度或異常圖片數量時，生成／重開結果才回傳 `content: []`，省略 `structuredContent`。完整卡片資料仍在 `_meta["ngini-image-bridge/card"]`，發送前驗證卡片身份及圖片資料；fixture 標示、原圖身份與狀態不變。這不會自行將任務標為 delivered。

沒有圖片的等待結果、停止／錯誤／取消／耗盡額度／異常多圖，保留原有公開資訊。沒有 App 能力的 fallback，以及普通 status／cancel、App-only read／chunk／delivery-report 回應不變。沒有猜測呼叫來源或新增通用瀏覽器權限。

新 parser 只接受具有有效完整 own metadata 的空白成功結果；缺少／損壞 own metadata 不默默降級。如果提供任何 `structuredContent`，仍核對其 request_id／status；空白結果必須真的沒有公開 content 且不是 isError。CardPoller 繼續核對回傳與所查詢的 request_id，身份不符會拒絕。沒有 own metadata 時仍接受完整 legacy 結果。

## 舊 RC9 frame

已開啟的 RC9 parser 要求公開 structuredContent 身份。更新後，舊卡片等待到成功時的 get_result 自動查詢／refresh 可能失敗；不能宣稱無縫相容。沒有可信 App-origin 標記可將相同 get_result 的模型與卡片呼叫分開。

需由使用者明確要求以**原 request_id** 在新版 versioned frame 重開既有圖片，0 次生成；不得用新 ID 重新生成。舊 App-only 下載／chunk／狀態回報與取消的輸出未更改，但舊 frame 跨版恢復仍待實機驗證。

## 證據範圍

實作後、RC10 升版前的一次針對性回歸：4 files／64/64 PASS、0 failure，Vitest 1.13 秒，明確 Node 24 runtime／pnpm 11.19.0。範圍為 card-contract、server-card-result、card-polling、card-presentation；包括 pinned SDK 的 InMemory tool call、空白結果解析、身份衝突拒絕、錯誤／取消／多圖／fallback 及 mock DOM 同原圖下載。這是候選改動的歷史 focused run，不是 RC10 完整 suite、建置、stdio 或 Claude 實機驗收。

核心 MCP 的空白 content／可省略 structuredContent 與當前工具沒有 outputSchema，在固定 SDK 測試中成立；這不等於 Claude renderer 或模型回合的驗收。沒有已驗證的 host end-turn 控制；本次實機嚴格只圖片結果為 **FAIL**，不保證靜默。

逐項狀態見 [RC10 驗收](acceptance-rc10.md)；[RC9 結果邊界](rc9-card-result-boundary.md) 與 [RC9 驗收](acceptance-rc9.md) 保留歷史實機 FAIL／PASS，不移轉為 RC10 通過。

本版新增證據：[完整受控 suite](offline-tests-rc10.json)、[compiled App stdio](protocol-app-card-rc10.json)、[CSP](card-csp-smoke-rc10.json) 與 [包外 App stdio](protocol-app-card-bundle-rc10.json) 均 PASS。

[實際 fresh 普通聊天的一次重開](host-existing-cat-reopen-rc10.json) 自動使用 ngini_get_result，以原 request_id 讀取已保存的 Ngini 貓圖；新 frame 顯示「DELIVERY_BLOCKED：收到的圖片卡片資料無效。」，沒有圖片預覽，assistant 仍說「已重新顯示這張貓圖。」。因此預覽及嚴格只圖片均 FAIL，原檔保存未測。這不是舊 RC9 frame refresh 的驗收。

原生檢視器的公開結果僅提供 host 的 interactive-widget 替代文字，並沒有揭示實際傳入 iframe 的 `_meta` 形狀。沒有 raw UI RPC 證據，不能從替代文字推斷故障原因。後測請求紀錄比較另待補入。封存的 RC10 MCPB 保留原樣，這是封包後新增的失敗紀錄。
