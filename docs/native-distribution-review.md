# Native dependency distribution review

查核日期：2026-10-09（Asia/Taipei）。範圍是 Windows x64、Sharp 0.35.5、libvips 8.18.7、既有 dev.15 隔離測試及後續材料選擇機制。本文件記錄工程證據和依授權條文作的發佈判讀，不是法律認證。未修改 dev.15、DLL、上游原始材料或已安裝外掛，未公開發佈。

## 本輪落實的交付 gate

`scripts/native-distribution.mjs` 現在提供可供 packager 呼叫的白名單與實際 staging 驗證。新 binary／source selection 都排除 `third_party/native/recipes/build-win64-mxe/`；新的 native-source companion 也排除其完整 tarball 和只作核對的 libvips ZIP／Sharp binary tgz。上游原 bytes 與舊凍結產物不改。未確認獨立授權的子樹不會因為在本機曾經收集就自動進入發行包。

所需 build source 改用固定上游 commit／archive URL、SHA 與明確指引；2026-10-08 23:16:53 UTC 已 GET 65,766 bytes 並核對既有 SHA。這是當時可取得的證據，不是再散布許可或持續可用承諾。新的 [source access directions](../third_party/native/SOURCE_ACCESS.md) 和 [replacement directions](../third_party/native/REPLACEMENT.md) 會隨選取材料交付。

13 個 filename collector 缺漏已補：原始 Cargo／README／AUTHORS／source header 原 bytes，加上六組固定 upstream 完整 license（以 crate source byte match 核對）；r-efi 的 AUTHORS 原本就含 MIT permission 與作者。四個早期 Steven Sheldon crates 只宣告 MIT／作者，沒有獨立 copyright／license 檔；保留這項來源事實及標準 MIT template，不虛構版權年份。詳見 [supplement index](../third_party/native/notice-supplements.json)。最後成功的 collector 回合抓取 75,815 bytes；先前定位與失敗回合另計，總網路量未量測。沒有額外生圖測試。

機械 gate 從 408 份歷史快取索引選取並核對 405 份 companion 輸入，不要求 fresh clone 還原已排除的三份快取，並將每個 allowed native 檔的 bytes／SHA 寫入 manifest。staging 多檔、少檔、修改、symlink 或混入 native-source cache 都拒絕。`evaluateNativeRelease` 另要求版本相符、SHA 正確的 application-source 與 native-source asset；沒有另外核實的 public-access receipt 時，僅可回報本機發行集合已準備，不會宣稱 public binary release ready。該 receipt 由發布者記錄實際 HTTPS 下載／hash 查核；selector 自身不會公開、上傳或捏造網址。

完全相同 native 重建、完整 Sigstore、修改後相容 DLL 實際編譯仍為 NOT_RUN；前兩項不是這個材料 gate 的自動硬門檻。公開下載路線與持續 source access 是需要在真正公開時完成的動作，不可拿私人快取當作已公開。

**原始碼可以先準備上 GitHub；原生重建、完全相同的二進位輸出與完整 Sigstore 驗證，不是「原始碼開源」的自動先決條件。** 含 DLL 的 MCPB 是另一個交付物，必須處理所附函式庫的授權、來源取得與重新組合條件。GNU 的說明也區分使用使用者已有的共享函式庫，和自行隨應用程式交付該函式庫的情形。[GNU LGPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#LGPLStaticVsDynamic)

| 發佈內容 | 實際需要處理 | 本次判定 |
| --- | --- | --- |
| 自有 TypeScript／腳本、lockfile、安裝與測試文件；不含 DLL／node_modules | 自有授權、第三方來源檔各自的授權與標示、沒有私密資料、準確的功能限制 | 缺乏原生編譯器不阻止這個範圍的原始碼交付。相依套件由使用者另行取得，不等同在 repository 交付它們的二進位檔。 |
| Repository 額外包含第三方原始碼、標頭、build recipes／patches | 保留原授權與 copyright，不把全部內容改稱 MIT；核實每個被複製子樹的再散布依據 | 純 source export 已選擇排除 `third_party/native/recipes/build-win64-mxe/`，改保留固定上游 commit／連結與本機抓取配方。該快照沒有根目錄 LICENSE，本專案不替上游補授權。 |
| 含 DLL 的 Windows MCPB | LGPL／MPL／Apache 等條件、相應來源及 build inputs 的取得方式、必要 notices、可重新組合的應用程式與相容的函式庫替換路徑 | 來源包與 notices 已在本機備妥；公開下載位置及相鄰指引尚未發佈。隔離組件測試通過，修改後相容 DLL 的完整編譯／執行未測。 |

若 repository 同時附上 `.mcpb`、DLL，或其 release asset，便不能再把整個交付稱為上表第一列的「僅原始碼」。

這次乾淨 GitHub export 的範圍不含上述 build-win64-mxe recipes 子樹、既有 MCPB／native-source ZIP、native-source 快取或私人執行資料。本機凍結產物保持原狀，沒有隨此選擇公開。現有 materials manifests 記錄的是本機曾收集的材料；其中指向被排除子樹的相對路徑，須改查固定上游來源，或由使用者執行 collector 後在本機取得，不能當作 export 已包含該檔案的宣稱。

## 確切的函式庫與連結方式

Sharp 的 JavaScript／native addon 採 Apache-2.0。隨 Windows 套件提供的 [上游 README](../third_party/native/upstream/sharp-win32-x64-README.md) 列出實際 native licenses；[versions.json](../third_party/native/upstream/sharp-win32-x64-versions.json) 與 [materials.json](../third_party/native/materials.json) 對應精確版本及來源雜湊。

| 元件 | 固定材料中的授權選擇／說明 |
| --- | --- |
| libvips、GLib、FriBidi、libexif、libheif、librsvg、Pango、proxy-libintl | 上游 Windows 套件以 LGPLv3 使用；其中部分原始碼文字為 LGPLv2／2.1 加「或後續版本」。保留 GPLv3、LGPLv3 及原始授權文字。 |
| Cairo 1.18.6 | 套件 README 列 MPL-1.1；Cairo 的原始 COPYING 另明示可選 LGPL-2.1。不能把測試／工具目錄的其他授權當作 Cairo runtime 的授權。 |
| libimagequant 2.4.1、libarchive 3.8.9 | 分別為上游指定的 BSD-2-Clause fork 與 BSD-2-Clause；不是以其他現代 libimagequant 版本的授權推定。 |
| AOM、FreeType、MozJPEG、libpng、fontconfig 等 | 除一般 MIT／BSD／zlib 類條件外，保留 AOM patent text、FreeType FTL／attribution、IJG 及各元件特有文件。 |
| librsvg Cargo.lock 的 357 個 registry entries | 全部來源均已按 lock SHA-256 保存，包含 dev／其他 target。六項宣告 MPL-2.0：cssparser、cssparser-color、cssparser-macros、dtoa-short、mp4parse、selectors；不能據此宣稱六項都已連入 Windows DLL。其餘含雙授權、Unicode、LLVM exception 等，原宣告及 notices 已保留。 |

Cairo／Rust covered files 的來源與 notices 仍受其原授權約束；MPL 允許 larger work 保持其他條款，並要求其 covered executable 的來源可取得。[MPL 1.1 §§3.2–3.7](https://www.mozilla.org/en-US/MPL/1.1/)、[MPL 2.0 §§3.1–3.4](https://www.mozilla.org/en-US/MPL/2.0/)。Sharp 的 Apache 授權要求保留適用的授權與 notices；這不把內含其他函式庫改成 Apache 授權。[Apache-2.0 §4](https://www.apache.org/licenses/LICENSE-2.0)

固定 [vips recipe](https://github.com/libvips/build-win64-mxe/blob/ef19ca09af2453d127453d677c849ccb37cf5694/build/vips.mk) 強制產出共享的 `libvips-42.dll`。所選 **web/static** target 將多個依賴靜態連入這個 DLL；「應用程式旁邊有 DLL」不足以涵蓋 DLL 內部所有函式庫的來源與 notices。[固定 build recipes](https://github.com/libvips/build-win64-mxe/tree/ef19ca09af2453d127453d677c849ccb37cf5694)、[上游 web dependency list](https://github.com/libvips/build-win64-mxe/blob/ef19ca09af2453d127453d677c849ccb37cf5694/README.md#libvips-web-dependencies)

Sharp 的 `.node` 動態載入 `libvips-cpp-8.18.7.dll`，後者使用 `libvips-42.dll`。Sharp [binding.gyp](https://github.com/lovell/sharp/blob/51a990faa26ade5586a4934ac9673c98d8893326/src/binding.gyp) 明確以 MSVC 從五個 libvips C++ 來源重建 bridge。官方 ZIP 的 MinGW `libvips-cpp-42.dll` 不是可直接改名替代的同 ABI 檔案；本次 PE 檢查及實際隔離載入均確認此差異。

## 已執行的隔離測試

執行：

```text
node scripts/native-replacement-smoke.mjs --out docs/native-distribution-smoke-dev15.json
```

Node v24.19.0／Windows x64；2026-10-08 22:57:39–22:57:42 UTC。五個情境符合預期：

1. 將 Sharp 與依賴複製到全新的暫存組件；PNG／JPEG／WebP 均經目前 production `validateImage` 完整解碼，尺寸、MIME、原圖 SHA 正確且位元組未被修改。
2. 移除暫存 C++ DLL：新的 Node 程序載入失敗，沒有悄悄使用原套件。
3. 移除暫存主 DLL：同樣載入失敗。
4. 使用 SHA 已核實的官方同版 ZIP C++ DLL：載入失敗，符合 ABI 檢查；Sharp 所需的 109 個具名 C++ exports 均不在此 MinGW DLL 中。
5. 依組件路徑恢復相符的 MSVC bridge：三種格式再次通過完整解碼。Node 報告確認實際載入的三個 native 檔案都在隔離目錄。

結果是 **PASS_ASSEMBLY_SEAM_NOT_NATIVE_REBUILD**。這比只比對同一份 DLL 的雜湊多驗證了失敗控制、真正的檔案載入及解碼行為；仍不等於編譯並載入「修改後且介面相容」的函式庫。那項測試、native compile、實際使用者外掛的替換均為 **NOT_RUN**。原套件未變更，暫存組件已刪除；沒有網路下載或 Ngini 提交。執行 JSON 是私有開發證據，預設被 `.gitignore` 排除。

## 使用者修改／重建的可行路線

在自己的 source checkout／外掛副本中操作，先停止該副本的 MCP 程序，保留原圖與 browser profile。套件的 native 檔案在 `node_modules/@img/sharp-win32-x64/lib/`；pnpm source checkout 可能經 symlink 指向其 store。不要修改共用 pnpm store 以測另一個安裝。

Sharp 官方重建指令為 `npm explore sharp -- npm run build`，要求 C++17、node-addon-api、node-gyp 及後者的依賴；Windows 不支援以全域 libvips 偵測當作自訂版本路線。[Sharp build prerequisites](https://sharp.pixelplumbing.com/install/#building-from-source)。本機 PATH 及常見 Visual Studio／Windows Kits 位置未找到可用 C++／Rust 工具鏈，故本次沒有執行編譯或自動安裝工具。

對 Windows 這個固定版本，先依 libvips／MXE 的 target recipes 重建需要修改的 C library；再使用相符的 headers、Windows `libvips.lib`、五份 C++ 來源及 MSVC 重建 Sharp bridge／addon。C++ public ABI 改變時要一起重建使用它的 addon。原始標頭／import inputs 的路徑及雜湊在 [Sharp provenance](../third_party/native/provenance/sharp-provenance.json)；assembly smoke 提供恢復後的解碼檢查，尚未代替上述編譯步驟。

LGPLv3 §4 提供重新組合所需 source／application code 或 suitable shared-library mechanism 等路線，並保護對函式庫修改及為除錯而 reverse engineering 的權利；此處的 MIT 應用程式來源可供重新組合，沒有新增禁止替換條款。是否完全滿足指定 binary 組合的條件，仍依實際交付資料及介面相容的修改版本判斷。[LGPLv3 §4](https://www.gnu.org/licenses/lgpl-3.0.en.html#section4)

## 發佈前的實際剩餘動作

- **僅原始碼 GitHub：**本次已選擇排除 build-win64-mxe recipes 子樹，保留固定上游連結及抓取指令。確認 export 持續遵守該排除條件，保留其餘子樹原授權、未驗收產品範圍及非官方整合說明。尚未確認的該子樹再散布依據不妨礙這個較窄的自有程式公開範圍。
- **二進位 MCPB：**將已準備的 source／native-source archive 與 notices 一起安排可持續取得的下載位置，在 binary 下載旁標清版本、SHA、source route 及重新組合文件。GPLv3 §6(d) 允許符合條件的另一個 server，但散布者仍須確保來源可用；不必無條件替使用者作三年 written-offer 承諾。[GPLv3 §6(d)](https://www.gnu.org/licenses/gpl.en.html#section6)
- **來源內容：**核對 archive 是相應 native 版本的 preferred source、必要 patches／build scripts／headers，並保留 Cairo、Rust MPL files、特有版權與 patent notices。357 entries 是保守的全集，不是最小 linked dependency 證明；13 個 filename 缺漏已加入原始宣告／notices／標準條文並保留其具體限制，不宣稱法律認證。
- **可重建性與工具鏈：**文件要有可用的建置步驟與所需工具。GNU 的 Corresponding Source 定義排除符合條件的 System Libraries 和未修改的一般工具；不能把「尚未保留每個 compiler／容器的全部來源」自動升格為禁止發佈。修改過且屬於 work 的 build inputs 則另行判斷。[GPLv3 §1](https://www.gnu.org/licenses/gpl.en.html#section1)
- **增加工程信心：**未來在備妥工具鏈的隔離環境編譯一個介面相容的修改版並跑載入／解碼測試。完全相同的二進位重建及完整 Sigstore 驗證可作供應鏈強化，不是本案所有原始碼公開的強制驗收項。

本次成功的 assembly 測試縮小了「使用本機組件路徑能否重新載入」的缺口；沒有替擁有者發布 repository、下載路線、服務承諾或法律聲明。GNU 即時文字頁本輪存取逾時，條文核對使用已保存的官方 GPLv3／LGPLv3 原文，並交叉核對 GNU 官方搜尋結果；其他官方文件已重新讀取。

本機 collector 不依賴 export 內已有 recipes 子樹：`scripts/native-materials.py` 會從固定上游 archive／commit 讀取並在本機重新產生材料。它需連同 `native_sharp_materials.py`、`native_rust_materials.py` 和 `verify-native-registry.mjs` 一起保留；之後再次 export 時仍須排除被重新產生的子樹。隔離 smoke 另需 collector 取得的 SHA 核實官方 ZIP、已安裝的 locked Sharp 依賴及建置好的 validator，純 source checkout 尚未完成這些前置步驟時不宣稱可直接執行 native smoke。
