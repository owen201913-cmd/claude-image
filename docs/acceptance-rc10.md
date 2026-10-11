# RC10 候選驗收

2026-10-10（Asia/Taipei）。目前候選 `0.1.0-rc.10`；空白公開成功結果已實作，建置、完整受控回歸、封包與安裝核對通過，但實際普通聊天重開貓圖顯示卡片資料無效，沒有圖片預覽，且仍附加完成文字。**正式驗收 NOT_PASSED**，尚未公開，MIT 授權不變。

正常、有圖片且無例外的 App 生成／重開結果使用空白 `content`、不提供 `structuredContent`，完整有效卡片資料留在 own `_meta`。錯誤、取消、額度、等待、異常多圖與 fallback 保留公開事實；詳見 [RC10 卡片邊界](rc10-card-result-boundary.md)。這是可實測的結果行為改動，不是 host 靜默保證。

| 項目 | 狀態 | 目前證據／缺口 |
| --- | --- | --- |
| 此改動的 focused unit／parser／mock DOM | PASS | 升版前一次歷史 run：4 files、64/64，0 failure，Vitest 1.13 秒；包括 actual pinned SDK InMemory call，沒有 browser／Ngini／Claude |
| RC10 TypeScript／UI 建置 | PASS | 一次實際本版建置，5.325 秒 wall time；不是 host 驗收 |
| RC10 完整受控 suite／stdio／CSP | PASS | [23 檔、328/328](offline-tests-rc10.json)，零 skipped；[compiled App stdio 6 checks](protocol-app-card-rc10.json)，[三個 CSP assertions](card-csp-smoke-rc10.json)。全部本機 fixture、零 Ngini；不是 Claude host |
| RC10 MCPB／隔離協定 | PASS | 本版 MCPB schema、[3,549 members 包外核對](candidate-inspection-rc10.json)、[隔離 normal／fixture／restart](isolated-protocol-smoke-0.1.0-rc.10.json)、[包外 App stdio 6 checks](protocol-app-card-bundle-rc10.json)。零瀏覽器、零 Ngini；不是 clean Windows |
| RC10 source archive／隔離重建 | NOT_RUN | 尚未封存本版來源，不改寫 RC9 assets |
| RC10 安裝及 served resource 核對 | PASS | [本版安裝核對](desktop-install-rc10.json)；這不等於聊天圖片交付 |
| RC10 普通聊天重開既有貓圖預覽 | FAIL | [一次實際 host 觀察](host-existing-cat-reopen-rc10.json)：自動使用 ngini_get_result，卡片顯示資料無效，沒有圖片預覽；未取得 raw UI RPC，原因未確定 |
| RC10 原圖保存 | NOT_RUN | 本次卡片沒有可驗證預覽，未進行原圖保存；不繼承 RC9 |
| RC10 嚴格只圖片、沒有 assistant 文字 | FAIL | 同一次實機觀察仍出現「已重新顯示這張貓圖。」；圖片實際未顯示，這句也不能作為完成證據 |
| 舊 RC9 pending／refresh 與新版同 ID 重開 | NOT_RUN | 舊 parser 可能拒絕空白成功結果；需明確重開新 versioned frame，0 generation |
| 更新／解除安裝的資料保留、實機 host log privacy | NOT_RUN | 不以程式或 fixture 代替實際 host 生命週期／日誌證據 |
| 乾淨 Windows P4 | BLOCKED | 尚未豁免；VM 已建立並保持關機；兩次 precreate 格式問題的原始紀錄保留。Secure Boot 人工設定、Windows 安裝／登入及乾淨 Claude 驗收未完成 |
| 新 Ngini 真實生成 | NOT_RUN | live 預算 0；此次 focused 回歸沒有新增提交 |

歷史 RC9：[T02 一個普通聊天 prompt-only 範例](host-prompt-only-rc9.json) PASS；[既有貓圖原檔保存](host-cat-original-download-rc9-renamed.json) 與 [三份 TEST 原檔保存](host-three-fixtures-download-rc9.json) 共 4 份新保存原檔的 SHA／完整解碼／stable stat PASS。這是 1 份既有 Ngini 圖與 3 份本機 TEST，不是 4 張新生成。RC9 單圖與三圖重開仍有模型文字、嚴格只圖片 FAIL；中／大 TEST 的目視預覽驗收仍未完成。以上不移轉成 RC10 PASS。

RC9 與 RC10 已封存產物保留原樣；此頁與新 host 報告是封包後的目前證據，沒有重新打包。此次只要求重開既有圖片，沒有要求生成；請求紀錄的後測比較另待補入，不以 host 文字或協定 mock 代替。後續本版實測應新增版本化證據，不借用歷史結果宣稱完成。
