# Clean Windows lab options — 2026-10-10

P4 remains **BLOCKED_NOT_WAIVED**. This document prepares a concrete way to create a clean Windows guest; it does not record a VM installation, Claude installation, lifecycle test or acceptance PASS. The user previously chose to retain release-candidate status until this gate can be tested.

The original lookup and installer preparation took place on 2026-10-10 Asia/Taipei. The installer download completed at **2026-10-09 21:36:23.269841 UTC**; Authenticode was checked at **21:36:40.535380 UTC**. No new software was executed or installed during that preparation. The owner subsequently authorized installation of that exact verified VirtualBox installer; the separate desktop workflow and human completed installation. The parent then verified the installed VBoxManage version as **7.2.20r175154**. This is evidence of VirtualBox base installation, not VM startup, guest Windows/Claude installation or P4 acceptance. Approval alone was not installation evidence. This document's author has not operated the installer or a VM. No Windows ISO, Extension Pack, account registration, license acceptance, host feature/security change or public upload was performed by this preparation.

## Practical route: VirtualBox base + official Windows 11 evaluation

Use an ordinary x64 Windows 11 Enterprise evaluation guest in the **VirtualBox base package**, subject to the user's approval to install the VM software and acceptance of the applicable Windows evaluation terms. This would create an actual separate Windows installation and can support the required Claude ordinary-chat install/restart/update/uninstall checks. A folder-isolated process on the current Windows installation cannot replace this gate.

[Oracle's installation guide](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/installation.html) lists Windows 11 x86_64 hosts and documents the Windows installer and its host driver components. This route changes the host through a normal software/driver installation; it is not a portable, no-system-change route. The [VirtualBox base package](https://www.virtualbox.org/wiki/Downloads) uses GPLv3; the optional Extension Pack has separate terms and is not needed or included in this proposal.

[Microsoft's evaluation page](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise) currently offers a 90-day evaluation, requires registration and says a product key is not required. It describes the evaluation as intended for IT professionals evaluating the product for their organization. The user must decide eligibility, review/accept the actual supplied terms, and complete registration/account or activation steps themselves. This preparation does not establish a paid Windows entitlement or authorize permanent evaluation use. No existing host license is assumed to cover a guest.

The [official Windows 11 VM requirements](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements) include at least 4 GB guest RAM, 64 GB disk capacity, two virtual processors, and UEFI/Secure-Boot-capable firmware with virtual TPM 2.0. The host must meet the applicable processor requirements. Configure these guest features normally; do not disable installation checks or change the host's security settings to avoid them.

For planning, budget **80–100 GiB of host free storage**, including ISO, a growing VM disk, updates and a test snapshot. These are engineering allowances, not measured VM consumption or additional Microsoft minimums. Actual ISO bytes remain unknown because the registration/download step has not been performed. The subsequent narrow CPU/RAM observation below replaces the original unmeasured 4–8 GiB RAM allowance with a conditional **4 GiB** guest plan.

## Prepared official installer

Only the following Windows base installer was downloaded into the project's private, excluded runtime folder. It must not be copied into the repository, source export, MCPB or evidence archive.

| Item | Recorded result |
| --- | --- |
| Installer | `VirtualBox-7.2.20-175154-Win.exe` |
| Version/build | 7.2.20 / 175154 |
| Official binary source | [Oracle release directory](https://download.virtualbox.org/virtualbox/7.2.20/VirtualBox-7.2.20-175154-Win.exe) |
| Downloaded bytes | 178,192,488; exact HTTP Content-Length match |
| Official SHA source | [SHA256SUMS](https://download.virtualbox.org/virtualbox/7.2.20/SHA256SUMS) |
| SHA-256 | `a81777d2b36380ce042a29e9c554cf032eb46a793f62e3cc82e7411e535c2c26` — PASS |
| Authenticode | `Valid` / `Signature verified.` |
| Publisher | Oracle America, Inc. |
| Signer thumbprint | `2B1BD188256EB612578949A943DE0DDC52D1DF79` |
| Signer certificate interval | 2025-01-10 through 2028-01-11 UTC |
| Timestamp signer | DigiCert SHA256 RSA4096 Timestamp Responder 2026 1 |
| Execution/installation | NOT_RUN / NOT_RUN at original preparation; later authorized, separate operator verification pending |
| Extension Pack / Windows ISO | Not downloaded |

The first publisher string check falsely rejected the quoted X.500 organization field (`O="Oracle America, Inc."`). A separate correction reuses the original `Valid` Authenticode result and parses the quoted field. Both private records are retained; neither signature verification nor the installer hash was repeated. This was a checker parsing error, not a signature failure.

Only the current workspace's C: volume free space was checked, before the download: **245,927,006,208 bytes, about 229.0 GiB**. That is reasonable for the proposed lab allowance, but no VM storage was allocated and no machine/VM inventory was rescanned.

Private prepared location: `.runtime/clean-windows-lab/installers/`. The three private JSON records retain the download, original Authenticode observation and publisher-parser correction. Public documentation uses only the installer basename and verification result, without developer home paths.

## Why portable QEMU is not a completed solution

[QEMU documents TCG on Windows](https://www.qemu.org/docs/master/system/introduction.html) as software CPU emulation, so it can avoid a new hardware-accelerator installation. Its [WHPX backend](https://www.qemu.org/docs/master/system/whpx.html), however, requires the Windows Hypervisor Platform feature; enabling that feature is a separate host change.

The current [QEMU TPM option documentation](https://www.qemu.org/docs/master/system/qemu-manpage.html#tpm-device-options) labels the TPM emulator backend as Linux-host only. The [swtpm project's Cygwin build instructions](https://github.com/stefanberger/swtpm/wiki#compile-and-install-on-cygwin) alone do not establish that a native Windows QEMU build can use that backend. Therefore a portable Windows QEMU plus a Windows 11 ISO is not presently a source-proven, compliant ready-to-run solution here. Neither a TPM requirement bypass nor the host's hardware TPM passthrough is proposed.

A legally supplied Windows 10 Enterprise LTSC 2021 ISO could provide a narrower clean Windows 10 guest using TCG. [Microsoft's Windows 10 basic requirements](https://support.microsoft.com/en-us/windows/windows-10-system-requirements-6d4e9a79-66bf-7950-467c-795cf0386715) list 2 GB RAM for x64, 32 GB disk and DirectX 9/WDDM 1.0 graphics, without the Windows 11 TPM/UEFI requirements. [LTSC 2021](https://learn.microsoft.com/en-us/windows/whats-new/ltsc/whats-new-windows-10-2021) corresponds to 21H2, and its [separate lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/windows-10-enterprise-ltsc-2021) remains active into January 2027. The current lifecycle page displays an end timestamp of 2027-01-13 06:59:59 while labeling dates Pacific Time; no date normalization is assumed here.

That option is still blocked by media/entitlement availability: this lookup's actual requests to the official Windows 10 Enterprise evaluation, download and old registration URLs redirected to Microsoft's Windows 10 end-of-support article. Historical search snippets mentioning an LTSC evaluation ISO are not proof of an available current download. No third-party ISO or ordinary unactivated retail ISO is substituted. TCG performance for Windows/Chromium/Claude was not measured and may make practical UI testing slow; no completion time is promised.

[Claude's current installation requirements](https://support.claude.com/en/articles/10065433-install-claude-desktop) say Windows 10 or higher. Its [Windows deployment guidance](https://support.claude.com/en/articles/12622703-deploy-claude-desktop-for-windows) permits installation without admin access with Cowork unavailable. This product tests ordinary chat, not Cowork. LTSC compatibility is still an untested inference; Microsoft warns that general-channel application support on LTSC may be limited. Any successful Windows 10 guest result would be labeled **Windows 10 LTSC**, not clean Windows 11 support.

The old Microsoft prebuilt developer-VM URL also redirected to [Windows developer tools](https://learn.microsoft.com/en-us/windows/dev-environment/), without an available prebuilt VM on that returned page. It is not treated as an existing downloadable clean guest.

## Concrete guest plan after installer approval

One read-only host observation at **2026-10-09 21:46:37.9803749 UTC** queried only CPU, installed/available memory and hypervisor presence. It did not inspect process lists, private settings, VM inventories, firmware or user files.

| Observation | Result |
| --- | --- |
| Processor | Intel Core 5 210H; x64; 8 cores / 12 logical processors |
| Installed physical RAM | 16,739,082,240 bytes, about 15.59 GiB |
| Available physical RAM at that instant | 1,732,124 KiB, about 1.65 GiB |
| HypervisorPresent | `true` |
| WMI virtualization/monitor-mode/SLAT flags | All `false`; firmware readiness is **not established** by these flags |

[Intel's model specification](https://www.intel.com/content/www/us/en/products/sku/241652/intel-core-5-processor-210h-12m-cache-up-to-4-80-ghz/specifications.html) confirms that this CPU supports VT-x and EPT. This describes the processor, not current firmware settings or successful VM startup. Microsoft's [Hyper-V requirements guidance](https://learn.microsoft.com/en-us/virtualization/hyper-v-on-windows/reference/hyper-v-requirements) explains that some requirement details are not displayed when a hypervisor is already detected. The combination of this observation and that guidance warrants treating the WMI flags as inconclusive here, rather than declaring virtualization absent.

Oracle's [7.2 user guide, “Using Hyper-V with Oracle VirtualBox”](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/EN-VBOX-7-2-USER.pdf) says VirtualBox can use an existing Hyper-V engine when Windows Hypervisor Platform is also enabled, with possible performance degradation. This observation did not prove that Windows Hypervisor Platform is enabled or that VirtualBox can start a guest. Retain host security settings. If the installed software reports a missing backend or feature, record that exact failure and obtain authorization for any newly proposed host change; do not disable Hyper-V, VBS, Memory Integrity or Secure Boot to continue.

The following is a proposed configuration, **not an executed or accepted VM configuration**. The CPU/RAM choices leave room for the host; the display/network/privacy choices are conservative test settings. Oracle documents VM creation and the separate [TPM, UEFI, Secure Boot and I/O APIC controls](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/working-with-vms.html). Microsoft documents the minimum [Windows 11 VM requirements](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements).

| Setting | Proposed value and check |
| --- | --- |
| VM name / guest architecture | `Claude-Image-Clean-Win11`; Windows 11 **x64**, not Arm or LTSC |
| VM location | A new dedicated private lab folder; never a source-export, OneDrive-synced or existing user-data folder |
| Installation mode | Manual; deselect **Install OS Using Unattended Installation**, so credentials and Windows terms are not written into automation parameters |
| CPU | **2 vCPU**, default execution cap; nested virtualization disabled |
| RAM | **4096 MiB**; do not start with the observed 1.65 GiB free RAM |
| Disk | New **80 GiB dynamically allocated VDI**, ordinary SATA controller; no physical/raw disk access |
| Firmware / security | **UEFI on, Secure Boot on, TPM Version 2.0**; use emulated TPM, not host TPM passthrough |
| Core platform | Keep I/O APIC and ACPI enabled; leave other Windows 11 preset defaults unless the normal installer identifies a requirement |
| Display | Windows guest's VBoxSVGA default, one monitor, 128 MiB video RAM; initially leave 3D acceleration off and record actual rendering success |
| Network | One ordinary **NAT** adapter, no port-forwarding or bridged network |
| Host integration | Shared clipboard, drag-and-drop and shared folders disabled; no USB filters/passthrough, camera/microphone capture or remote-display server |
| Guest Additions | Not an Extension Pack. If needed for display usability, install only the included Oracle Guest Additions **inside the guest**, after recording that extra guest component; keep sharing disabled |

**Memory is the immediate launch gate.** Oracle's [creation instructions](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/create-vm.html) say guest RAM must be available to allocate and warns that insufficient remaining host RAM causes excessive swapping. Save work and let the user choose which unused applications to close. Before the first guest start, make one new narrow available-memory check because that state will have changed; require at least **6 GiB available** for this 4 GiB guest plan. The extra 2 GiB is this lab's headroom allowance, not an Oracle/Microsoft requirement. Do not close user processes automatically, enlarge paging files, or lower the guest below Windows' minimum. If memory cannot be freed, retain the blocker rather than force a slow or unstable run.

NAT permits ordinary outbound connections and is not complete host isolation: Oracle's [security guide](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/Security.html) notes that a NAT guest can access the host loopback interface. No local server or host-filesystem exposure is needed for these tests. Guest sign-in must use the user's own account in the guest; do not copy host browser cookies, account sessions or passwords.

## Installation handoff and future P4 evidence

The exact approved Oracle base installation was completed by the human; the parent verified VBoxManage **7.2.20r175154**. VM creation and guest Windows/Claude installation remain **NOT_RUN**. The user must handle any subsequent sensitive confirmations. If installation requires additional host feature/firmware changes, stop and describe the specific requirement before proceeding. Do not install the Extension Pack or accept Windows evaluation terms on the user's behalf.

With VirtualBox installation verified, the following guest sequence is still pending. None of these guest steps has run:

1. Have the user review eligibility and actual evaluation terms and complete official registration. Obtain only the ordinary **Windows 11 Enterprise x64** ISO for the chosen language; record actual edition/build, filename, bytes and Microsoft's matching published hash. An official download page offering 26H2 does not prove that an ISO has been obtained. Keep its private location outside public artifacts.
2. Once memory is available, create the new VM with the table's settings. Review the powered-off VM's UEFI, Secure Boot and emulated TPM 2.0 before the first start. Keep the default secure-boot trust setup; if boot fails, stop and record the error rather than turn checks off, replace keys or reset NVRAM blindly.
3. Boot the ISO normally and install Windows only to the new virtual disk. Let the user handle license, privacy, Microsoft account and activation screens directly. Choose privacy options explicitly with the user; do not enable host-file synchronization, restore a host/cloud PC backup, or use an OOBE/network/account bypass. Evaluation expiry and activation requirements remain Microsoft's rules. [Microsoft evaluation guidance](https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise)
4. In the fresh guest, record `winver`, System Information's **BIOS Mode: UEFI / Secure Boot State: On**, and `tpm.msc` showing specification **2.0**. The normal Windows setup and these checks must agree; a working desktop alone is not secure-configuration evidence. Record the actual VirtualBox engine and guest display behavior, with failures retained.
5. Install the current official Claude Desktop normally inside the guest, with the user performing Claude sign-in. Do not install development Node/npm/pnpm, source code, or copied host profiles. Transfer only the reviewed candidate MCPB and public test inputs through a narrow read-only lab medium, then install from the guest's non-development Downloads folder. The precise transfer method and allowlist must be recorded before creating that medium.
6. Run the ordinary-chat fixture preview/original-download test with explicit fixture labeling. Record host capability, displayed result, saved-original bytes, full decode and SHA comparison. Test Claude restart, a declared package update, and uninstall/reinstall while checking the guest's own output preservation. Record every actual Windows/Claude/browser/package version and distinct PASS/FAIL/BLOCKED/NOT_RUN result. No successful fixture may be labeled Ngini live generation.

The current live generation budget remains **zero**; no new Ngini submission is authorized by this lab preparation. Clean-guest installation/lifecycle evidence must stand separately from previously verified source builds or current-host downloads. A successful guest test supports that exact Windows 11 Enterprise guest/version and does not by itself establish clean Windows 11 Home or macOS compatibility.

Until those real guest checks pass, the result is **P4 BLOCKED_NOT_WAIVED** and the extension remains a release candidate. Installer integrity and installed VirtualBox version PASS are prerequisites only; neither is a guest or lifecycle PASS.
