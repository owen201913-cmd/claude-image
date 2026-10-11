# RC9 模型／卡片結果分離與跨版遷移

2026-10-10（Asia/Taipei）。來源 0.1.0-rc.9，已安裝／固定候選為 RC9。本文件補記封包後證據：新普通聊天既有圖預覽／三項模型投影 PASS，嚴格只圖片 FAIL；單張既有貓圖的改名原檔新保存 PASS，舊 frame 遷移仍 NOT_RUN。

## 資料邊界

有 App MIME 能力的正常 app_poll 生成／重開結果，完整卡片事實與預覽放在 `_meta["ngini-image-bridge/card"]`；模型 content／structuredContent 保留 request_id、status、delivery_mode。失敗、取消、額度耗盡與非預期多圖仍公開必要資訊。沒有 App 的 model_poll 保留完整舊形狀與模型預覽；普通狀態／取消工具仍提供完整中立事實。

實作在 `src/server.ts` 的 present/cardOnly 分支與 `src/ui/card-contract.ts` 的 imageCardToolResult／parseCardToolResult。新 parser 核對公開 ID／status 與完整 metadata，一旦 metadata 損壞或不一致會拒絕，不降級成舊 shape；沒有 metadata 時接受舊完整 structuredContent。fixture 來源標示與 image_ready／presenting／delivered 的真實區分仍保留，不將保存成功當作已交付。

採用 pinned MCP Apps SDK 1.3.2 的 tool-result／metadata 機制；本機型別的 `McpUiToolResultNotification.params` 為標準 CallToolResult。參考 [MCP Apps 規格](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)。協定與型別支援不等於 Claude 已把 `_meta` 轉送 App，也不是可強制結束模型回合或隱藏文字的能力。

## 舊 RC8 frame

新 RC9 frame 可以讀舊完整結果，反方向不對稱。已開啟的 RC8 client 僅將 response.structuredContent 交給舊 parser，舊 parser 必須有 message；RC9 正常 app_poll 公開結果不再有 message／image。因此舊卡片的 pending 自動查詢與 refresh 可能失敗，不能宣稱跨版無縫相容。凍結 RC8 來源 `src/ui/image-card-client.ts` 的 polling 與初始／更新讀取是此判斷的程式依據。

沒有可信的 App-origin 標記可保證只向舊 App 回傳完整資料。若更新後舊卡片受阻，使用者明確要求以**原 request_id** 重開，由新 RC9 卡片讀既有原圖；不得另建生成任務。既有原圖 read／chunk 工具未改，不能因此推斷舊 frame 所有操作都失效，也不能當作實機遷移 PASS。舊 pending／refresh 與明確重開的 actual host 驗證仍 NOT_RUN。

## 已執行與未驗

- RC9 source build 一次 exit 0；完整受控 suite 23 files／323/323 PASS、0 failed／pending／todo／skip，三項 browser flags 全開，raw 時間 24.474 秒，見本版 offline-tests-rc9.json。這包含 envelope/parser/production UI 的受控回歸，不是 Claude iframe。
- 實際編譯來源 stdio App-capability 測試 6 checks PASS：精確 built HTML、窄模型事實與完整 metadata、同 ID 原圖、實際 chunk bytes、App 狀態及必要查詢錯誤、重啟後無 App 完整後備。只建立一筆隔離 TEST 任務，0 browser／Ngini；host download 只準備請求，沒有實際保存，見 protocol-app-card-rc9.json。
- suite 輸出的 RC9 strict-CSP 證據已另存 card-csp-smoke-rc9.json；未另重跑 CSP。固定 RC9 MCPB 的精確 HTML 與該證據核對 PASS，沒有 CSP 重跑。
- 包外候選 bootstrap 的相同 App-capability 6 checks PASS；同時獨立 archive 3,547 files 讀回、schema／安全路徑／CRC PASS。包外普通 stdio 正常 7／fixture 8、重啟 PASS，344 包內模組／0 包外；browser NOT_RUN。App stdio 報告自身只驗工具協定，不獨立驗證 archive。
- 固定來源 export／application-source ZIP 與一次 fresh store frozen install／build PASS：57.014 秒、28/28 runtime 等於固定 MCPB、fixture stdio PASS；不是 native rebuild、suite 重跑或 clean Windows。額外 GitHub ZIP 未建立，[RC9 native companion 關聯](native-source-companion-rc9.json) PASS：3 份已記錄 binary inventories 與 12 份 selected small archived inputs 相同，沿用固定 RC8 native-source archive；大包 SHA／完整 405-input 證據為歷史 RC8，本輪未重雜湊全部 binary／archive，未建立新 RC9 native ZIP 或進行 native rebuild。
- RC9 新普通聊天既有圖預覽／三項模型投影 PASS、嚴格無文字 FAIL；單張貓圖改名保存檔 bytes／SHA／完整解碼／stable stat PASS；raw iframe metadata notification trace、中／大 fixture 實際預覽、其他 RC9 host、舊 frame 遷移及乾淨 VM／Windows NOT_RUN。RC8 歷史結果不移轉為 RC9 PASS。live 預算 0、未公開。

逐項狀態見 [RC9 驗收](acceptance-rc9.md)；歷史 [RC8 圖片回覆邊界](image-only-host-boundary-rc8.md) 與 [RC8 host 補充](rc8-host-supplement-20261010.md) 保留原判斷與證據。


## RC9 實際 host 與回覆控制邊界

RC9 已在現有主機更新，manifest 版本及 28/28 own runtime bytes／SHA 與記錄的 candidate inventory 相符；不宣稱本輪重新核對全部 3,547 installed files 或 native binary。隔離 installed bootstrap 精確 UI9 HTML、5 App／2 ordinary tools 與 App-only visibility PASS，0 新任務。詳見 [安裝核對](desktop-install-rc9.json) 與 [隔離資源核對](installed-resource-inspection-rc9.json)。

Claude Desktop 2.26454.2／Sonnet 5.5 的一個新普通聊天，以原 request_id 重開既有貓圖：一張正確圖片卡片預覽 PASS；實際工具結果 inspector 只見 request_id、status=presenting、delivery_mode=app_poll 三項模型事實，投影 PASS。卡片在窄公開結果下顯示既有原圖，但沒有 instrument raw iframe notification，不把實際 `_meta` 通訊追蹤宣稱已驗。最後仍加一句「已重新開啟該圖片的卡片。」，嚴格只圖片 FAIL。單張貓圖改名保存檔的新 bytes／SHA／完整解碼／stable stat PASS；這是保存檔補證，不宣稱 trace raw UI RPC 或每個人工 dialog 點擊；既有圖重開不消耗新生圖額度。詳見 [RC9 單圖實機](host-existing-cat-reopen-rc9.json)。

已再次查核 pinned MCP Apps 1.3.2／MCP SDK 1.32.1 與官方 [MCP Apps 規格](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)、[Claude MCP Apps 文件](https://claude.com/docs/connectors/building/mcp-apps/getting-started) 及 [Claude 工具呼叫流程](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)。HostCapabilities／CallToolResult 沒有已文件化的 suppress-final-prose／end-turn 控制；ui/message 是使用者訊息，updateModelContext 是未來回合上下文，API end_turn 是宿主處理的模型停止原因，不能由 MCP 結果任意指定。這是已查核公開介面的邊界，不宣稱永久不可能。RC9 資料分離有效，但沒有驗證依據支持再以改指令或升版就能保證靜默。


[RC9 單圖讀取前後任務比較](host-request-state-rc9.json) PASS：9→9，未新增／遺失 ID，submitted_at、完整 image identity 與 source 均未變。這個快照不驗證下載原檔或網站剩餘額度，新增 live 0。


單張貓圖的新保存補證見 [改名原檔驗證](host-cat-original-download-rc9-renamed.json)：91,506 bytes、1344×768，SHA-256 與原圖相符、full Sharp decode／stable stat PASS。[初次 exact-name probe](host-cat-original-download-rc9.json) 維持 NOT_RUN，沒有讀圖片 bytes；原實機觀察 JSON 保留其當時狀態。嚴格只圖片仍 FAIL，中／大 fixture 實際預覽、其他 RC9 host／舊 frame 遷移／乾淨 VM／Windows NOT_RUN。固定 MCPB／export／ZIP 未改；目前沒有建立證據 ZIP，新增 live 0。


[RC9 三份 TEST 保存補證](host-three-fixtures-download-rc9.json)：RC9 三份既有 TEST 原檔的新保存 3/3 bytes／SHA／full Sharp decode／stable stat PASS，兩個檔案時間均在基線後，0 舊圖片 bytes／新增 live；加上既有貓圖，共 4 份 RC9 新保存原檔通過。檔案 verifier 不觀察 UI。主代理另觀察小圖預覽及其三項模型結果 PASS；中／大圖實際預覽尚未目視驗證，NOT_RUN。三次 get_result 與 AX 最後文字已觀察：「三張圖都已依序重開一次（小圖、一般圖、大圖），未生成任何新圖片。」，批次嚴格只圖片 FAIL。
