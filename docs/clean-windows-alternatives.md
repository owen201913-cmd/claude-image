# 乾淨 Windows 驗收替代路線

查核日期：2026-10-12（Asia/Taipei）。這是可執行前的方案，不是通過報告；所有新的 OS／Claude 生命週期案例均為 **NOT_RUN**。目標受測候選為 **RC12**；已安裝／已封存 RC11 的證據僅屬歷史，不證明 RC12。正式執行前必須取得並核對實際 RC12 MCPB，不能沿用 RC11 的雜湊或安裝結果。不得藉替代路線把普通聊天、原圖下載或只圖片要求降級。

## 建議：Windows 11 VHDX native boot

Microsoft 的 [native boot 文件](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/deploy-windows-on-a-vhd--native-boot?view=windows-11) 允許從獨立 VHDX 啟動 Windows，不同時執行原主機 OS 或 hypervisor。因此不用替主機與測試 VM 同時保留 RAM，也不降低 Windows 11 的記憶體要求。乾淨 OS 只裝官方 Claude Desktop、標準瀏覽器和受測 MCPB；不用開發 Node/npm/SDK。

此方法會暫時離開原 Windows 工作階段；不是安全沙箱，也不代表新 OS 無法看見其他本機磁碟。只允許測試資料、明確選定的安裝包與本機 TEST fixture，禁止讀取或複製原主機瀏覽器、聊天、圖片、憑證及其他專案。現有 Android 模擬器不得默認停止；重啟需要擁有者另行批准並先保存工作。

已取得官方 Windows 11 評估 ISO 並完成當時檔案核對，不重新下載。Microsoft 評估用途／Windows 條款的接受仍須由操作者完成。不能把 ISO 可取得解讀為正式 Windows 授權或所有條款已接受。

已在另行授權的 Phase A 中確認必要磁碟條件：主機磁碟已完全解密、NTFS、基本本機 GPT 磁碟、UEFI，以及足夠的規劃空間。這只通過前置條件；安裝映像索引、VHDX 建立與套用、開機項目、Windows 初次啟動及 Claude 驗收仍未執行，不代表乾淨 Windows 測試通過。

映像辨識輔助程式第一次執行未產生工作資料夾，缺少當次錯誤證據，標為 **UNKNOWN_EARLY_EXIT**。只讀診斷找出原生目錄父物件缺少 PowerShell provider 屬性、嚴格模式會提早中止的程式問題；已準備型別判斷修正及有大小上限的提早失敗紀錄，等待審查後執行。不把程式修正或語法解析當成取得映像索引或 Windows 驗收通過。

修正啟動檢查後的實際執行已完成兩次唯讀 DISM 查詢，均正常退出，且 ISO 已確認卸載；但映像欄位解析回報 **MEDIA_METADATA_FIELD_AMBIGUOUS**，未選出映像。舊紀錄沒有欄名、數量與原始輸出，不能確定當次是哪個欄位。已改為從唯一映像 Index 邊界解析、排除工具版本標頭，保留真正欄位重複／缺少時停止；7 個純文字 fixtures 通過。下一次實際查詢會私下保存有上限的輸出，公開證據僅記欄名／數量／範圍；實際索引與乾淨 Windows 驗收仍未通過。

## 執行前的固定守門條件

1. 擁有者先批准必要的條件讀取及離線 staging；BCD 更動和重啟是另外兩個批准步驟。
2. 目標是本機 basic disk 上的 NTFS volume；不得使用 SMB、dynamic disk、nested VHDX 或既有使用者 VHDX。
3. VHDX 所在 parent volume 必須符合官方不使用 BitLocker 加密的限制。若狀態不可讀或不符合，停止；不得解密、停用 Device Encryption／BitLocker，或要求降低保護來讓驗收通過。
4. 預留 80 GiB 的全新 VHDX，另留 20 GiB 的外部 pagefile／操作餘裕；這是實作規劃，不是 Microsoft 官方門檻。Dynamic VHDX 的 parent volume 必須有足以擴展到上限及建立 pagefile 的空間。檢查不合格就停止，不改 partition。
5. VHDX 路徑必須是任務專用的新檔、位於已批准資料夾，不存在、不經 junction/symlink 指到他處。只格式化新 VHDX 的新 partition；不得執行 physical disk 的 `clean`、format、resize、convert。
6. 由既有官方 ISO 的 Windows Enterprise Evaluation image 建立獨立 OS；先辨識 WIM/ESD 與 image index，絕不固定猜 index。新 VHDX 不應帶 internet Zone.Identifier，不盲目解除其他檔案封鎖。
7. 在任何 boot mutation 前，另行取得管理員／BCD 修改批准，匯出完整 BCD 備份、記錄原 default GUID／boot order／timeout，以及精確新 entry GUID。不能覆寫原 entry 或把測試 OS 設為默认。
8. 按 [BCDBoot 官方選項](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/bcdboot-command-line-options-techref-di?view=windows-11) 審查 `/d` 保留原 default、`/p` 保留原 UEFI boot order；兩者可並用。BCDBoot 仍會寫 system partition boot files，不可聲稱只有新增 entry。不同 boot-entry 實作需要另行審查。
9. 原系統可返回的 recovery 路徑必須先由擁有者確認；不得把 BitLocker recovery key 收進腳本、日誌、報告或聊天。若 recovery 準備不明、boot 參數不受支援或寫入結果不確定，停止，不重啟。
10. 登入、Windows 條款、Claude MCPB 權限及原圖下載確認保持正常人工介面。不得開無驗證遠端控制、RDP tunnel 或公開服務，也不改 Secure Boot／TPM／主機安全設定。

Microsoft 的 [部署步驟](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/boot-to-vhd--native-boot--add-a-virtual-hard-disk-to-the-boot-menu?view=windows-11) 包含「全新目的裝置」的清磁碟範例；該部分不適用已有使用者資料的電腦，不得直接執行。Native boot 不支援 hibernation；回到原系統要正常重啟，不能依賴休眠保存工作階段。

## 操作者流程與 P4 證據

批准條件讀取 → 條件符合才建立新 VHDX／離線套用 OS → 審閱 BCD 備份與新 entry 方案 → 分別批准 boot mutation、保存所有工作、重啟 → Windows 初次設定／條款 → 官方 Claude 安裝與登入 → 下表案例 → 返回原 OS、核對證據 → 刪除精確測試 entry 與任務 VHDX，清理需另行批准。

原主機 Codex／桌面操作工具不會跨 OS 重啟繼續運行。測試時由操作者使用準備好的逐項步驟／有限範圍 helper 留存本機證據，回到原 OS 後再核對；不能假稱 agent 在背景跨 reboot 測試。準備與執行必須分開。

| 案例 | 必要的真實證據 | 現況 |
| --- | --- | --- |
| G01 乾淨 OS | 新 VHDX／正常 Windows 初次設定、確切 OS／Claude／瀏覽器版本、沒有開發 runtime；條款人工接受 | NOT_RUN |
| G02 原生 MCPB 安裝 | 新 OS 中 Claude 安裝介面、候選版本／實際啟動；不手編 JSON／執行 npm | NOT_RUN |
| G03 零生圖守門 | Native diagnostic fixture setting 已載入、source=fixture、TEST 標記、無 Ngini branch | NOT_RUN |
| G04 普通聊天意圖 | 新一般聊天中文一句描述自動選工具，不指定工具名；一筆 fixture 任務 | NOT_RUN |
| G05 聊天圖片 | 一張使用者可见 TEST 圖、精簡卡片；模型附加文字與 host chrome 分開記錄 | NOT_RUN |
| G06 原圖保存 | 當前卡片正常下載確認後的新檔，原 bytes／SHA-256 相同、完整 decode、stable stat | NOT_RUN |
| G07 Claude 重啟 | 正常關閉／啟動後設定、同 request_id／image identity／原圖保存不變，不生成第二筆 | NOT_RUN |
| G08 真實版本更新 | 在同一乾淨測試 OS 記錄 RC12 首裝後，正常移除並安裝已驗證的 RC11，再建立明確 fixture，實測 RC11→RC12 原生更新與原圖／request 保留；明示此前 RC12 安裝歷史，不冒稱另一全新 baseline。必要時可用來源另經驗證的 RC9→RC12，記錄實際版本；不是同版重裝，不需第二份 80 GiB 映像 | NOT_RUN |
| G09 卸載／重裝 | Claude 正常原生移除與重裝，原圖與同 ID 可重取；不誤刪其他檔案 | NOT_RUN |
| G10 隱私與零 live | 只讀自建 fixture／任務 metadata，沒有原主機資料匯入／Ngini 提交；不利用新 OS 重置免費額度 | NOT_RUN |

記錄日期、步驟、版本、期望、實際結果及 PASS／FAIL／BLOCKED／NOT_RUN。原圖與 request/fixture phase timestamp 不等於 Ngini live 次數；需以 fixture 分支和實際來源辨識。fixture 只能驗證交付与生命週期，不能替代真實 Ngini 生圖內容、配額或背景瀏覽器 E2E。原先嚴格只圖片的 FAIL 需另行修復、在實際 Claude 驗收。

## GitHub Windows runner 的用途與邊界

[GitHub hosted runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) 每次 job 提供新 VM（單 CPU 例外）；公開 repository 的標準 x64 Windows runner 有 16 GB RAM、免費使用。這是可用的新環境，不依賴開發主機 RAM；private repository 的額度／費用另算，需在擁有者授權範圍內。

可以新增候選包 QA job：官方 schema／包解壓、空 PATH／獨立 HOME 的 stdio 啟動、fixture 原圖 decode/SHA、MCP process 重啟後同 ID 重取、舊版 fixture data 加新版 runtime 的保存相容性與受控移除。這些測「候選包/runtime/data lifecycle」，不能宣稱測過 Claude 原生 MCPB 安裝、更新／解除安裝介面或登入後聊天下載。現有 workflow 只做來源離線檢查，新增包 QA job 未執行。

標準 `windows-2025` 是 [Windows Server 2025](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md)，不是 Windows 11 x64 桌面；另一免費 Windows 11 ARM runner 不符合本套件目前 x64 平台要求。因此 CI 可補工程證據，不能單獨將全部 P4 標 PASS。不能為取得互動桌面把 Actions 變成未驗證 RDP 主機。

本文件與 workflow 准備不授權公開 repository／Release，實際 publication 仍由擁有者最後確認。
