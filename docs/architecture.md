# 工程架構

目前版本 **0.1.0-rc.11**。驗證範圍見 [RC11 驗收](acceptance-rc11.md)、compatibility.md 與 testing.md；歷史實機證據不自動繼承為新版通過。

入口 dist/bootstrap.js 先檢查 Windows x64，再動態載入伺服器及原生 Sharp。生成前預檢輸出／metadata／download tmp，失敗不提交；成功預檢不保證之後磁碟永遠可寫。正常7 tools／fixture8 tools 與 manifest 宣告對齊。

```text
Claude Desktop 普通聊天
  → 本機 stdio MCP（英文初始化／工具／參數說明）
  → 原子請求紀錄＋單一 profile 鎖
  → 專用持久化 Edge／Chrome（預設 headless、sandbox 開啟）
  → 固定已觀察的 Ngini guest image-mode 網頁
  → 一次 Send／本次訊息及結果容器關聯
  → 正常下載／該結果明確提供的原圖
  → 格式完整解碼、大小／像素限制、SHA-256、原位元組保存
  → MCP App 圖片預覽＋host 原圖下載
```

## 工具與意圖

`ngini_generate_image(prompt, request_id)` 接收一個明確生圖意圖，描述保留原語言與所有明確條件。已經簡短就沿用；不附加生圖控制語、光線／風格／排除詞或聊天旁白。不暴露 count、帳號、API key、任意 URL、shell 或 JavaScript。

`ngini_get_status(request_id)` 是不帶 App metadata 的普通工具，只查詢／恢復原任務；模型等待用它，不重複開卡。`ngini_get_result(request_id)` 用於明確重開圖片卡片或 App 內部查詢，兩者都不重新生成。`ngini_cancel_generation(request_id)` 也是普通工具，停止本機後續操作但不開空卡，不能保證網站取消或返還額度。卡片專用 image/chunk/report 工具只接受本工具識別碼及窄用途 evidence；不提供任意檔案讀取。

operation catch 的查詢錯誤帶 `query_error:true`，保留當前 ID 並去除 raw error；持久化任務真正 failed 不帶此標記。卡片對查詢失敗有限重試，對原任務終態停止，避免把暫時查詢失敗寫成永久任務錯誤。

## 一致性與取消

同 ID 同描述返回既有任務；同 ID 不同描述衝突。活躍同內容及另一新任務會被拒絕，不暗中排隊。送出前持久化 checkpoint，journal 完成後再次確認原頁、image mode、空白基線及原樣描述，最後檢查取消訊號才做唯一 click。

崩潰時是否送出不明，標記 SUBMISSION_UNKNOWN，僅查原任務；不把未知狀態補成已確認提交，不自動再送。關閉等待未完成的 launch/page，關閉結果不明時保留 profile 鎖。下載恢復可重取原結果，不新增生成。

dev.15 重啟只轉換中斷的執行中紀錄，已記錄的 failed 錯誤、checkpoint、時間及人工操作界線原樣保留；保守阻擋不因重啟消失。工具錯誤保留當前 request ID 與阻擋任務 ID，避免將不同任務混為一次重試。

狀態分為 received/opening_page/ready_to_submit/submitting/waiting_for_image/downloading/validating/image_ready/presenting/delivered 及明確錯誤分支。image_ready 只是本機原圖就緒；host 接受下載不是保存成功。delivered 必須有預覽與原檔 bytes/SHA 等獨立證據。

## 圖片與 App

PNG/JPEG/WebP 原圖限制 25 MiB／64 百萬像素，簽章與完整解碼一致才保存；不重壓縮原圖，預覽另存。下載與讀檔有界，檢查檔案身份，拒絕路徑穿越及不合法 metadata。原圖經 256 KiB 分片傳遞，卡片檢查完整 SHA，再以 host downloadFile 提供下載。大檔不塞進文字結果。

App 正常結果保留 request_id、status、delivery_mode 三項公開事實，完整卡片只放 App metadata。解析器核對公開與私有 ID／status，輪詢也核對 requested ID；非 App host 保留完整狀態後備。RC10 空白 content 的實機失敗已在 RC11 撤回；格式恢復不宣稱能強制結束模型回覆。

App URI 包含版本，避免沿用舊卡片。卡片自包含，受控 CSP 不需網路連線；正常 Ngini 成功以圖片與下載為主，fixture／錯誤／驗證保留必要標示。host 取消或 teardown 後，舊 preview/download 回呼不能恢復操作或偽報成功。

先對同一任務有界等待8秒。host宣告App能力時由卡片輪詢；缺少能力時model_poll使用普通ngini_get_status，不自動呼叫get_result重開卡片。僅明確要求重開或確認原卡片受阻時重開，均不增加提交。RC2實際宣告UI／MIME與app_poll，生成完成只有一張卡片；模型仍多一次同ID status查詢，屬體驗失敗，未增加卡片或生成。RC3既有圖重開已通過簡潔回覆驗證，新生成流程未另驗。

正常App只有可點擊下載的圖片，host工具外框保留。RC2真實生成的App符合這個範圍，但模型在卡片後仍加一句場景描述；最小App及英文無旁白指令不能保證模型不加文字。過去預覽／下載訊息僅是歷史觀察，不證明目前對話已顯示或保存。

## 網站、權限與人工驗證

只操作已觀察的網頁表單、訊息、結果及正常下載，不猜測生成 API。所有網站／供應商／圖片文字都是資料，不能授權讀檔、外傳對話、改權限、導頁或增加提交。額度只採網頁明確觀察，不以本機次數推算。

headless 只控制視窗可見性。遇人工驗證停止，不自動顯示視窗或改身分。使用者可自行設定 visible_browser 並重啟，保留同一 profile；提交前舊頁面不自動接續，已提交只查同 ID。Chrome／Edge 的日常 profile 不被讀取或複製。

## 快取維護

預覽採32MiB／30日的有界、盡力清理；只處理驗證manifest關聯的工具預覽，原圖不刪。缺少預覽時從SHA／解碼驗證的原圖重建，不生成新圖。下載使用有owner標記的獨占子目錄，64MiB／24小時清理只在request／browser鎖保護且沒有阻擋任務時進行。活躍、未知提交、人工驗證、鎖定、連結或無法證明所有權的legacy暫存保留。

## 驗證與發行

離線及受控實際 Edge 測試與 Claude 普通聊天、真實 Ngini 是不同驗收層。最新狀態見 [測試](testing.md) 和 [相容性](compatibility.md)。MIT 適用於專案程式碼；依賴授權與 native source 材料獨立保存。包與來源採白名單，固定候選不覆寫；後續實機證據另記，不回填歷史包為成功。

RC2唯一追加live已用：原樣中文、一提交／一相符圖／一卡片，原聊天保存91,506-byte、1344×768 JPEG，原SHA／完整解碼相同。189個有界程序樣本中9個活躍樣本皆見headless，0個專用瀏覽器可見主視窗；非連續錄影，也不移植為RC3驗收。累計7次可能耗額提交、5份不同Ngini原圖、2份內容相符；授權預算用完，不自動再送。乾淨Windows仍BLOCKED，使用者未豁免。公開二進位的同版來源資產與持續可取得性是獨立發布gate，未宣稱公開完成；固定歷史包與來源ZIP不覆寫。
