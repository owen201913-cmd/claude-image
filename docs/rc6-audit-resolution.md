# RC6 審查與驗證

2026-10-09（Asia/Taipei）。RC5 固定產物與所有失敗紀錄保留。RC6 修正 production 最終文字／驗證辨識、安全預覽／下載暫存清理、貢獻文件舊版本與包內缺漏引用。本輪新增 Ngini 生成 **0 次**，沒有公開 repository 或 release。

## 執行紀錄

- build PASS；22個測試檔、300/300完整離線 PASS，0失敗／跳過，三種受控browser flag全開，35.536秒。這是RC6本輪結果，沒有沿用RC5的272項。
- 來源stdio PASS：正常7 tools／fixture8、英文初始化／工具說明、固定版本App URI、原檔分塊SHA與去重。fixture 29,746 bytes，SHA `27bf9188b1bc651b2052c9610e4bfb9206d51b07ee918290042b034a5f068ff0`。
- 精確RC6 HTML嚴格CSP PASS，使用完整suite已落盤的零高度iframe案例證據，沒有重跑瀏覽器；合成下載bytes／SHA一致，零CSP／page error／外部請求。HTML SHA `2c1dce6f11bdc214d341e86ce3d5cddd55bf1cd4c5ae73776ae60afe45d5b3fb`。不是Claude iframe驗收。
- 直接執行開發CI前置檢查首次FAIL：PATH的pnpm為11.25.0，專案鎖定11.19.0。build使用專案管理的11.19.0已通過；不修改全域工具，前置檢查補明確CLI參數後以Node24.19.0／pnpm11.19.0執行一次PASS；未修改全域工具。這是本機metadata檢查，不是GitHub託管CI。

封包時版本與後續結果的時間界線保留；不改寫固定MCPB。封存後實測另列候選旁RELEASE報告，以下新增結果也會收入 application-source 快照。

## 封存後的隔離驗證

- MCPB 官方 schema、archive 與 stage 的 3,537 個檔案讀回一致；實際包在開發樹外的正常 protocol、fixture 原檔／去重、重新啟動取回同圖均 PASS。
- 首次隔離 browser FAIL 保留於 `isolated-bundle-smoke-0.1.0-rc.6.json`：測試程式覆寫啟動期限為10秒且清空PATH，launch失敗後child未退出。最初Edge啟動逾時的根因仍未知。
- 無瀏覽器的工具解析診斷確認：空PATH無法解析Windows `taskkill`；System32-only PATH可解析。這證明測試的程序清理前提有缺漏，不代表已證明最初啟動失敗根因。
- 只修正測試程式，固定MCPB位元組未改動。protocol維持空PATH；browser使用System32-only PATH及production預設30秒，保留有上限的本機私密stderr並分記結果／程序退出。修正後執行1次cold start，Edge154.0.4258.62正常啟動、驗證本機data頁面、關閉且child exit0，PASS 1/1，沒有連線Ngini。證據 `isolated-browser-corrected-0.1.0-rc.6.json`；不可稱大量穩定性或乾淨Windows驗收。
- native-source 1,302檔、405個來源輸入讀回PASS。application-source及新store建置依固定RELEASE最終結果為準，不預先宣稱通過。

## 辨識與清理界線

Cloudflare 官方 `cf-mitigated: challenge` 是文件證據，未在 Ngini live 觀察。一般403、任意頁面文字、assistant 的「拒絕」字眼不是可信系統訊號。非串流最終文字可停止為 PROVIDER_TEXT_ONLY；來源未提供可靠拒絕標記時，不稱 GENERATION_REFUSED 生產辨識已通過。未知狀態保守停止／逾時，不改寫後重送。

只有一次既有自有 Ngini 對話唯讀觀察：1次導頁、5筆非 GET／HEAD 請求被阻擋、0次生成，未取得可靠 terminal DOM，結果 BLOCKED／READ_ONLY_OBSERVATION_FAILED。保留失敗，不追加嘗試；受控頁面與快取的公開 frontend 證據分開記錄。

預覽32MiB／30日、已證明工具所有權的下載暫存64MiB／24小時是工程清理預設。清理有掃描上限、會跳過活躍／未知／鎖定／不安全檔案，不能保證所有磁碟用量永遠低於上限。原圖、請求紀錄、瀏覽器profile與無法證明所有權的舊暫存保留。清理驗收只使用臨時fixture。

## 必須保留的未驗證項目

RC6 實際 Claude 更新、原聊天保存／SHA、新普通聊天完整生成、乾淨 Windows 生命週期、GitHub HTTPS／託管 CI 均未通過。live預算0；乾淨Windows BLOCKED且未豁免。RC5首次隔離harness逾時的runtime根因仍未知，後續成功不抹去失敗。詳細案例見 [逐項驗收](acceptance-rc6.md)。
