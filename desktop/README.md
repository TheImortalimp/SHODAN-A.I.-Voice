# SHODAN Voice desktop host

This folder contains the Windows desktop app: a .NET WinForms program that shows the SHODAN Voice Interface in a Microsoft Edge WebView2 window, guarded by WHITE ICE.

- **To install and use the app**, see [Desktop app](../docs/desktop.md).
- **For how it protects the files**, see [WHITE ICE in the desktop app](../docs/white-ice.md#in-the-desktop-app).
- **For the code and the build**, see [The desktop host](../docs/development.md#the-desktop-host).

## Build

From the repository root:

```powershell
npm ci
npm run desktop:publish   # web build + dotnet publish into desktop/publish/
npm run desktop:smoke     # end-to-end test of desktop/publish/
```

You need Node.js 20.19 or later, and the .NET SDK, version 8 or later.

| File | Purpose |
| --- | --- |
| `Program.cs` | Command-line options and exit codes. |
| `MainForm.cs` | The window, WebView2 set-up and lockdown, tray menu, float mode, page bridge and self-test. |
| `ContentStore.cs` | File integrity, file locks, Defender scanning and allowlisted serving. |
| `AmsiScanner.cs` | The Windows Antimalware Scan Interface wrapper. |
| `ShodanDesktop.csproj` | Embeds the web build's integrity manifest in the exe and copies the build to `app\`. |
| `shodan.ico` | The program icon. |
