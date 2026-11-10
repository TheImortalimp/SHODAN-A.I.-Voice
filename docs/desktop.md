# Desktop app

**SHODAN Voice** for Windows is the same app, packaged as a desktop program. A small .NET host shows it in a Microsoft Edge WebView2 window and adds protection a website cannot have:

- every file is checked against fingerprints compiled into the program;
- scripts are scanned by Microsoft Defender;
- the embedded browser is locked down.

See [WHITE ICE](./white-ice.md#in-the-desktop-app).

Compared with the website, the desktop app:

- can speak without a click first (idle monologues still wait for your first click or key press);
- has a tray icon and a float-on-top mode;
- does not support Discord Rich Presence.

## Requirements

- **Windows** 10 or 11, 64-bit (x64).
- **[.NET Desktop Runtime](https://dotnet.microsoft.com/download/dotnet), x64**, version 8 or later. The app was built for .NET 8 and also runs on newer versions, so if you need to install one, choose the current LTS release (.NET 10).
- **[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)**. It is included in Windows 11 and in up-to-date Windows 10.
- **About 200 MB** of disk space: about 115 MB for the program, most of it the neural voice model, and about 80 MB of browser data that WebView2 creates on the first run.

## Install

1. Download `SHODAN-Voice-v0.0.1-win-x64.zip` and `SHA256SUMS.txt` from the [v0.0.1 release](https://github.com/TheImortalimp/SHODAN-A.I.-Voice/releases/tag/v0.0.1).
2. [Verify the download](#verify-the-download).
3. Extract the zip to a folder of your choice, for example `%LOCALAPPDATA%\Programs\SHODAN Voice`. Keep the `app` folder next to `ShodanVoice.exe`.
4. Run `ShodanVoice.exe`.

There is no installer and nothing is written to the registry.

### Verify the download

In PowerShell, in the folder you downloaded to:

```powershell
Get-FileHash .\SHODAN-Voice-v0.0.1-win-x64.zip -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

The hash that `Get-FileHash` prints must match the line for `SHODAN-Voice-v0.0.1-win-x64.zip` in `SHA256SUMS.txt`. `Get-FileHash` prints capital letters and the file uses lowercase; the case does not matter. If the hashes differ, delete the zip and download it again.

### Windows SmartScreen

The program is not code-signed. The first time you run it, Windows may show **Windows protected your PC**. If you verified the checksum, select **More info**, then **Run anyway**.

## Using the app

The window works exactly like the website; see the [User guide](./user-guide.md).

| Action | How |
| --- | --- |
| Fullscreen | **F11**. **Esc** leaves fullscreen. |
| Float on top | **▣ FLOAT ON TOP** in the app, or *Float on top* in the tray menu. The window shrinks to a compact 380 × 620 panel that stays above other windows. **▣ EXIT FLOAT** restores it. |
| Quick commands | Right-click the tray icon: *AI transmit*, *Generate input*, *Stop transmission*, *Toggle autonomous transmissions*, *Float on top*, *Show SHODAN*, *Exit*. |
| Bring the window back | Double-click the tray icon, or choose *Show SHODAN*. |
| Quit | Close the window, or choose *Exit* in the tray menu. |

Links to other websites open in your default browser.

### Where your data goes

Settings are kept in the WebView2 profile at `%LOCALAPPDATA%\ShodanVoice\WebView2`. The app stores the same small set of settings as the website; see [Stored data](./configuration.md#stored-data).

### Uninstall

Close the app and delete:

- the folder you extracted it to;
- `%LOCALAPPDATA%\ShodanVoice`.

## File integrity

The files in the `app` folder are fingerprinted, and the fingerprints are compiled into `ShodanVoice.exe`. If any file is changed, missing or flagged by Defender, the app shows **◆ WHITE ICE / INTRUSION BLOCKED** with the affected files and does not load. Anything you add to the folder is ignored.

This means you cannot customise the desktop app by editing `app\shodan.json` or `app\monologues.xml`. Edit the files in `public/` and [build](#build-from-source) your own copy instead.

## Command line

| Option | Meaning |
| --- | --- |
| `--smoke-test` | Start, run a self-test, write a report and exit. A test line is spoken aloud. |
| `--smoke-out <file>` | Write the self-test report as JSON to `<file>`, plus a mid-speech screenshot with the same name and a `.png` extension. |
| `--user-data <folder>` | Use `<folder>` for the WebView2 profile instead of `%LOCALAPPDATA%\ShodanVoice\WebView2`. |

Exit codes for `--smoke-test`:

| Code | Meaning |
| --- | --- |
| 0 | Every check passed |
| 1 | A check failed, an error occurred, or the test did not finish within 4 minutes |
| 2 | WHITE ICE blocked a changed or flagged file |
| 3 | The WebView2 Runtime is not installed |
| 64 | Unknown or incomplete command-line option (in any mode) |

The self-test checks:

- the page title;
- Trusted Types;
- the CSP header;
- the integrity panel;
- the Defender scan result;
- SmartScreen;
- that unlisted files are refused;
- a full transmission with the Amy voice (no fallback);
- live lip sync;
- that there are no CSP violations and no blocked messages.

Example, in PowerShell in the app folder:

```powershell
.\ShodanVoice.exe --smoke-test --smoke-out "$env:TEMP\shodan-smoke\report.json" --user-data "$env:TEMP\shodan-smoke\profile" | Out-Null
$LASTEXITCODE
```

`ShodanVoice.exe` is a Windows app, not a console program, so PowerShell does not wait for it to exit. `| Out-Null` makes it wait, so `$LASTEXITCODE` shows the result.

## Build from source

You need:

- Node.js 20.19 or later;
- the .NET 8 SDK or later;
- Windows, for the desktop smoke test.

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`.

```powershell
npm ci
npm run desktop:publish   # web build + dotnet publish into desktop/publish/
npm run desktop:smoke     # end-to-end test of desktop/publish/
```

`npm run desktop:smoke` runs the app twice from a scratch copy:

1. **A genuine run.** The self-test passes, and the served files cannot be written, deleted or renamed while the app runs.
2. **A tampered run.** One byte is added to a script, and the app must refuse to start (exit code 2) and name the file.

Add `-- --keep` to keep the scratch copy, reports and screenshot.

See [Development](./development.md) for the full workflow.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| **Windows protected your PC** | The program is unsigned. Verify the checksum, then choose **More info** → **Run anyway**. |
| "You must install or update .NET to run this application" | Install the .NET Desktop Runtime (x64), version 8 or later. The current LTS release is recommended. |
| "SHODAN needs the Microsoft Edge WebView2 Runtime" | Choose **Yes** to open the official download page, then install the Evergreen runtime. |
| **◆ WHITE ICE / INTRUSION BLOCKED** | A file in `app` was changed, removed or flagged by your antivirus. Delete the folder and extract a fresh, verified copy. If your antivirus quarantined a file, check its history. |
| "The WebView2 browser process stopped" | Update the WebView2 Runtime (it updates with Microsoft Edge) and start the app again. |
| The window opens but stays empty | Run the self-test from a terminal and read the `error` field of the report. |
| No sound | Check the Windows volume and the selected output device. The first transmission takes a few seconds while the voice model loads. |
| DEFENDER / AMSI shows **UNAVAILABLE ON THIS SYSTEM** | No antivirus with AMSI support is active. The app still runs with file integrity checks. |
| The neural link cannot connect | Add `https://shodan-voice.example` to `OLLAMA_ORIGINS` and allow WebView2's permission prompt. See [Troubleshooting the neural link](./ai-handle.md#troubleshooting-the-neural-link). |
| Settings misbehave | Close the app and delete `%LOCALAPPDATA%\ShodanVoice`. |
