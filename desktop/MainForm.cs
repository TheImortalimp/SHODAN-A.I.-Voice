using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ShodanDesktop;

internal sealed class MainForm : Form
{
    private const string Title = "SHODAN // Voice Interface";
    private const string RuntimeDownload = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
    private static readonly Color Abyss = Color.FromArgb(4, 9, 7);
    private static readonly HashSet<string> EditCommands = new(StringComparer.Ordinal)
    {
        "undo", "redo", "cut", "copy", "paste", "pasteAndMatchStyle", "selectAll", "emoji",
    };

    private readonly HostOptions options;
    private readonly WebView2 webView;
    private readonly NotifyIcon? tray;
    private readonly ToolStripMenuItem? floatItem;
    private readonly TaskCompletionSource pageReady = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private ContentStore? store;
    private IntegrityReport? report;
    private bool floatMode;
    private bool fullScreen;
    private bool finished;
    private Rectangle floatRestoreBounds;
    private FormWindowState floatRestoreState;
    private Rectangle fullRestoreBounds;
    private FormWindowState fullRestoreState;
    private FormBorderStyle fullRestoreBorder;
    private int refusedRequests;

    public MainForm(HostOptions options)
    {
        this.options = options;
        Text = Title;
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? Icon;
        BackColor = Abyss;
        AutoScaleDimensions = new SizeF(96F, 96F);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = options.SmokeTest ? new Size(720, 540) : new Size(1320, 860);
        MinimumSize = new Size(340, 420);
        StartPosition = options.SmokeTest ? FormStartPosition.Manual : FormStartPosition.CenterScreen;

        webView = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Abyss };
        Controls.Add(webView);

        if (!options.SmokeTest)
        {
            (tray, floatItem) = CreateTray();
        }
    }

    public int ExitCode { get; private set; }

    protected override bool ShowWithoutActivation => options.SmokeTest;

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        if (options.SmokeTest)
        {
            var area = Screen.PrimaryScreen?.WorkingArea ?? Screen.FromControl(this).WorkingArea;
            Location = new Point(area.Right - Width - 16, area.Bottom - Height - 16);
            var watchdog = new System.Windows.Forms.Timer { Interval = 240_000 };
            watchdog.Tick += (_, _) =>
            {
                watchdog.Stop();
                FinishSmoke(new JsonObject { ["ok"] = false, ["error"] = "Watchdog: the smoke test did not finish in 4 minutes." }, 1);
            };
            watchdog.Start();
        }

        try
        {
            await StartAsync();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            if (options.SmokeTest)
            {
                FinishSmoke(new JsonObject { ["ok"] = false, ["error"] = "The WebView2 Runtime is not installed." }, 3);
                return;
            }

            var answer = MessageBox.Show(
                this,
                "SHODAN needs the Microsoft Edge WebView2 Runtime. Open the official download page?",
                Title,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (answer == DialogResult.Yes)
            {
                OpenExternal(RuntimeDownload);
            }

            Close();
        }
        catch (Exception error) when (error is InvalidDataException or IOException or UnauthorizedAccessException or InvalidOperationException or System.Runtime.InteropServices.COMException)
        {
            if (options.SmokeTest)
            {
                FinishSmoke(new JsonObject { ["ok"] = false, ["error"] = error.Message }, 1);
                return;
            }

            MessageBox.Show(this, $"SHODAN could not start: {error.Message}", Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.F11:
                ToggleFullScreen();
                return true;
            case Keys.Escape when fullScreen && webView.CoreWebView2?.ContainsFullScreenElement != true:
                SetFullScreen(false);
                return true;
            default:
                return base.ProcessCmdKey(ref msg, keyData);
        }
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        tray?.Dispose();
        store?.Dispose();
        base.OnFormClosed(e);
    }

    private static bool IsAppUri(string? value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) && IsAppUri(uri);

    private static bool IsAppUri(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttps && uri.IsDefaultPort && string.Equals(uri.Host, ContentStore.Host, StringComparison.OrdinalIgnoreCase);

    private static void OpenExternal(string target)
    {
        if (!Uri.TryCreate(target, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
        {
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
        }
        catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            // No default browser; the link is simply not opened.
        }
    }

    private static void ConfigureSettings(CoreWebView2Settings settings)
    {
        settings.IsScriptEnabled = true;
        settings.IsWebMessageEnabled = true;
        settings.AreHostObjectsAllowed = false;
        settings.IsStatusBarEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.IsSwipeNavigationEnabled = false;
        settings.IsReputationCheckingRequired = true;
#if DEBUG
        settings.AreDevToolsEnabled = true;
#else
        settings.AreDevToolsEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
#endif
    }

    private static void OnPermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        switch (e.PermissionKind)
        {
            case CoreWebView2PermissionKind.ClipboardRead when e.IsUserInitiated && IsAppUri(e.Uri):
            case CoreWebView2PermissionKind.Autoplay when IsAppUri(e.Uri):
                e.State = CoreWebView2PermissionState.Allow;
                break;
            case CoreWebView2PermissionKind.UnknownPermission:
                // Newer browser permissions (such as local-network access for the optional loopback
                // AI link) keep WebView2's own prompt, so the user decides.
                break;
            default:
                e.State = CoreWebView2PermissionState.Deny;
                break;
        }
    }

    private static void OnContextMenuRequested(object? sender, CoreWebView2ContextMenuRequestedEventArgs e)
    {
        var items = e.MenuItems;
        for (var i = items.Count - 1; i >= 0; i--)
        {
            var item = items[i];
#if DEBUG
            if (item.Name == "inspectElement")
            {
                continue;
            }
#endif
            if (item.Kind != CoreWebView2ContextMenuItemKind.Separator && !EditCommands.Contains(item.Name))
            {
                items.RemoveAt(i);
            }
        }

        for (var i = items.Count - 1; i >= 0; i--)
        {
            var separator = items[i].Kind == CoreWebView2ContextMenuItemKind.Separator;
            if (separator && (i == 0 || i == items.Count - 1 || items[i - 1].Kind == CoreWebView2ContextMenuItemKind.Separator))
            {
                items.RemoveAt(i);
            }
        }

        if (items.Count == 0)
        {
            e.Handled = true;
        }
    }

    private async Task StartAsync()
    {
        store = ContentStore.Load(Path.Combine(AppContext.BaseDirectory, "app"));
        using (var amsi = AmsiScanner.Create("SHODAN Voice Interface"))
        {
            report = store.VerifyAndLock(amsi);
        }

        if (!report.Trusted)
        {
            ShowBreach(report);
            if (options.SmokeTest)
            {
                FinishSmoke(new JsonObject { ["ok"] = false, ["breach"] = true, ["integrity"] = report.ToJson() }, 2);
            }

            return;
        }

        var userData = options.UserDataFolder
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ShodanVoice", "WebView2");
        var environment = await CoreWebView2Environment.CreateAsync(
            null,
            userData,
            new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required"));
        await webView.EnsureCoreWebView2Async(environment);

        var core = webView.CoreWebView2;
        ConfigureSettings(core.Settings);
        core.AddWebResourceRequestedFilter($"{ContentStore.Origin}/*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
        core.WebResourceRequested += OnWebResourceRequested;
        core.NavigationStarting += OnNavigationStarting;
        core.FrameNavigationStarting += (_, e) => e.Cancel = !IsAppUri(e.Uri);
        core.NewWindowRequested += OnNewWindowRequested;
        core.LaunchingExternalUriScheme += (_, e) => e.Cancel = true;
        core.PermissionRequested += OnPermissionRequested;
        core.DownloadStarting += (_, e) =>
        {
            e.Cancel = true;
            e.Handled = true;
        };
        core.BasicAuthenticationRequested += (_, e) => e.Cancel = true;
        core.ContextMenuRequested += OnContextMenuRequested;
        core.ContainsFullScreenElementChanged += (_, _) => SetFullScreen(core.ContainsFullScreenElement);
        core.WebMessageReceived += OnWebMessageReceived;
        core.ProcessFailed += OnProcessFailed;
        core.IsMuted = options.SmokeTest;
        core.Navigate($"{ContentStore.Origin}/{store.Entry}");

        if (options.SmokeTest)
        {
            await RunSmokeAsync();
        }
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var environment = webView.CoreWebView2.Environment;
        if (store is null || !Uri.TryCreate(e.Request.Uri, UriKind.Absolute, out var uri) || !IsAppUri(uri))
        {
            return;
        }

        if (e.Request.Method is not ("GET" or "HEAD"))
        {
            refusedRequests++;
            e.Response = environment.CreateWebResourceResponse(null, 405, "Method Not Allowed", ContentStore.ErrorHeaders);
            return;
        }

        var stream = store.Open(uri, out var path);
        if (stream is null)
        {
            refusedRequests++;
            e.Response = environment.CreateWebResourceResponse(null, 404, "Not Found", ContentStore.ErrorHeaders);
            return;
        }

        e.Response = environment.CreateWebResourceResponse(stream, 200, "OK", store.ResponseHeaders(path));
    }

    private void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (IsAppUri(e.Uri))
        {
            return;
        }

        e.Cancel = true;
        if (e.IsUserInitiated)
        {
            OpenExternal(e.Uri);
        }
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (e.IsUserInitiated)
        {
            OpenExternal(e.Uri);
        }
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!IsAppUri(e.Source))
        {
            return;
        }

        var json = e.WebMessageAsJson;
        if (json.Length > 4096)
        {
            return;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String)
            {
                return;
            }

            switch (type.GetString())
            {
                case "ready":
                    PostStatus();
                    PostHostState();
                    pageReady.TrySetResult();
                    break;
                case "float":
                    SetFloat(root.TryGetProperty("value", out var value) && value.ValueKind == JsonValueKind.True);
                    break;
            }
        }
        catch (JsonException)
        {
            // Malformed messages are ignored.
        }
    }

    private void OnProcessFailed(object? sender, CoreWebView2ProcessFailedEventArgs e)
    {
        if (options.SmokeTest)
        {
            FinishSmoke(new JsonObject { ["ok"] = false, ["error"] = $"WebView2 process failed: {e.ProcessFailedKind}" }, 1);
            return;
        }

        if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited)
        {
            MessageBox.Show(this, "The WebView2 browser process stopped. SHODAN will close.", Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
        else if (e.ProcessFailedKind is CoreWebView2ProcessFailedKind.RenderProcessExited or CoreWebView2ProcessFailedKind.RenderProcessUnresponsive)
        {
            webView.Reload();
        }
    }

    private void Post(JsonObject message) => webView.CoreWebView2?.PostWebMessageAsJson(message.ToJsonString());

    private void PostStatus()
    {
        if (report is null || webView.CoreWebView2 is null)
        {
            return;
        }

        Post(new JsonObject
        {
            ["type"] = "whiteice-status",
            ["version"] = webView.CoreWebView2.Environment.BrowserVersionString,
            ["smartScreen"] = webView.CoreWebView2.Settings.IsReputationCheckingRequired,
            ["integrity"] = new JsonObject
            {
                ["verified"] = report.Verified,
                ["total"] = report.Total,
                ["failed"] = report.Failed.Count,
                ["locked"] = report.Locked,
            },
            ["amsi"] = new JsonObject
            {
                ["available"] = report.AmsiAvailable,
                ["scanned"] = report.Scanned,
                ["detections"] = report.Detections.Count,
            },
        });
    }

    private void PostHostState() => Post(new JsonObject { ["type"] = "host-state", ["float"] = floatMode, ["compact"] = floatMode });

    private void Command(string name) => Post(new JsonObject { ["type"] = "command", ["name"] = name });

    private void SetFloat(bool on)
    {
        if (on != floatMode)
        {
            if (fullScreen)
            {
                SetFullScreen(false);
            }

            floatMode = on;
            if (on)
            {
                floatRestoreBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                floatRestoreState = WindowState == FormWindowState.Minimized ? FormWindowState.Normal : WindowState;
                WindowState = FormWindowState.Normal;
                var area = Screen.FromControl(this).WorkingArea;
                var size = LogicalToDeviceUnits(new Size(380, 620));
                Bounds = new Rectangle(area.Right - size.Width - 24, area.Bottom - size.Height - 24, size.Width, size.Height);
                TopMost = true;
            }
            else
            {
                TopMost = false;
                Bounds = floatRestoreBounds;
                WindowState = floatRestoreState;
            }

            if (floatItem is not null)
            {
                floatItem.Checked = on;
            }
        }

        PostHostState();
    }

    private void ToggleFullScreen()
    {
        if (webView.CoreWebView2?.ContainsFullScreenElement == true)
        {
            _ = webView.CoreWebView2.ExecuteScriptAsync("document.exitFullscreen()");
            return;
        }

        SetFullScreen(!fullScreen);
    }

    private void SetFullScreen(bool on)
    {
        if (on == fullScreen)
        {
            return;
        }

        fullScreen = on;
        if (on)
        {
            fullRestoreBorder = FormBorderStyle;
            fullRestoreState = WindowState;
            fullRestoreBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Normal;
            Bounds = Screen.FromControl(this).Bounds;
        }
        else
        {
            FormBorderStyle = fullRestoreBorder;
            Bounds = fullRestoreBounds;
            WindowState = fullRestoreState;
        }
    }

    private void RestoreWindow()
    {
        if (WindowState == FormWindowState.Minimized)
        {
            WindowState = FormWindowState.Normal;
        }

        Show();
        Activate();
    }

    private (NotifyIcon Tray, ToolStripMenuItem FloatItem) CreateTray()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("AI transmit", null, (_, _) => Command("transmit"));
        menu.Items.Add("Generate input", null, (_, _) => Command("generate"));
        menu.Items.Add("Stop transmission", null, (_, _) => Command("stop"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Toggle autonomous transmissions", null, (_, _) => Command("autonomous"));
        var floatMenuItem = new ToolStripMenuItem("Float on top", null, (_, _) => SetFloat(!floatMode));
        menu.Items.Add(floatMenuItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Show SHODAN", null, (_, _) => RestoreWindow());
        menu.Items.Add("Exit", null, (_, _) => Close());
        var icon = new NotifyIcon { Icon = Icon, Text = Title, ContextMenuStrip = menu, Visible = true };
        icon.DoubleClick += (_, _) => RestoreWindow();
        return (icon, floatMenuItem);
    }

    private void ShowBreach(IntegrityReport failed)
    {
        webView.Visible = false;
        var text = new StringBuilder();
        text.AppendLine("◆ WHITE ICE / INTRUSION BLOCKED").AppendLine();
        if (failed.Failed.Count > 0)
        {
            text.AppendLine($"{failed.Failed.Count} file(s) failed SHA-256 integrity verification:");
            foreach (var path in failed.Failed.Take(12))
            {
                text.AppendLine($"   {path}");
            }

            if (failed.Failed.Count > 12)
            {
                text.AppendLine($"   … and {failed.Failed.Count - 12} more");
            }

            text.AppendLine();
        }

        if (failed.Detections.Count > 0)
        {
            text.AppendLine($"Microsoft Defender (AMSI) blocked {failed.Detections.Count} file(s):");
            foreach (var path in failed.Detections.Take(12))
            {
                text.AppendLine($"   {path}");
            }

            text.AppendLine();
        }

        text.AppendLine("The interface was not loaded. Reinstall SHODAN Voice from a trusted build.");
        var label = new Label
        {
            Dock = DockStyle.Fill,
            Text = text.ToString(),
            ForeColor = Color.FromArgb(255, 120, 110),
            BackColor = Abyss,
            Font = new Font(FontFamily.GenericMonospace, 11f),
            Padding = new Padding(32),
        };
        Controls.Add(label);
        label.BringToFront();
    }

    private async Task RunSmokeAsync()
    {
        var result = new JsonObject { ["integrity"] = report?.ToJson() };
        var failures = new List<string>();
        try
        {
            await pageReady.Task.WaitAsync(TimeSpan.FromSeconds(45));
            await Task.Delay(1000);
            var page = await EvaluateJson("""
                (() => {
                  const text = (id) => document.getElementById(id)?.textContent ?? null;
                  return {
                    title: document.title,
                    url: location.href,
                    diagnostics: window.SHODAN.diagnostics(),
                    ice: { badge: text('iceBadge'), csp: text('iceCsp'), trustedTypes: text('iceTt'), host: text('iceHost'), integrity: text('iceIntegrity'), amsi: text('iceAmsi') },
                  };
                })()
                """);
            result["page"] = page;
            await webView.CoreWebView2.ExecuteScriptAsync("""
                Promise.all(['./not-in-manifest.js', './white-ice.manifest.json', './shodan.json']
                  .map((url) => fetch(url, { cache: 'no-store' }).then((r) => r.status, () => 0)))
                  .then((codes) => { window.__smokeFetch = codes; });
                window.__smokeTx = [];
                window.SHODAN.on('transmission', (detail) => window.__smokeTx.push(detail.state));
                void window.SHODAN.say('Integrity verified. Every system here answers to me.');
                """);

            JsonNode? voice = null;
            string? lipSync = null;
            var deadline = DateTime.UtcNow.AddSeconds(120);
            while (DateTime.UtcNow < deadline)
            {
                await Task.Delay(150);
                voice = await EvaluateJson("""
                    ({
                      states: window.__smokeTx,
                      engine: document.getElementById('engineStatus').textContent,
                      viseme: document.getElementById('visemeStatus').textContent,
                      log: document.getElementById('log').innerText.slice(-900),
                    })
                    """);
                var viseme = voice?["viseme"]?.GetValue<string>() ?? string.Empty;
                if (viseme.Contains("SYNC", StringComparison.Ordinal) && (lipSync is null || IsRest(lipSync)))
                {
                    lipSync = viseme;
                    if (!IsRest(viseme))
                    {
                        await CaptureAsync();
                    }
                }

                // start, then complete / fail / interrupted
                if (voice?["states"] is JsonArray { Count: > 1 })
                {
                    break;
                }
            }

            result["voice"] = voice;
            result["lipSync"] = lipSync;
            result["fetch"] = await EvaluateJson("window.__smokeFetch ?? null");
            result["whiteIce"] = await EvaluateJson("window.SHODAN.diagnostics().whiteIce");
            result["refusedRequests"] = refusedRequests;

            var total = report?.Total ?? -1;
            var log = voice?["log"]?.GetValue<string>() ?? string.Empty;
            Expect(page?["title"]?.GetValue<string>().Contains("SHODAN", StringComparison.Ordinal) == true, "page title", failures);
            Expect(page?["diagnostics"]?["whiteIce"]?["trustedTypes"]?.GetValue<bool>() == true, "Trusted Types armed", failures);
            Expect(page?["ice"]?["csp"]?.GetValue<string>() == "ENFORCED / HEADER + META", "CSP header + meta", failures);
            Expect(page?["ice"]?["integrity"]?.GetValue<string>() == $"{total} / {total} VERIFIED / LOCKED", "integrity panel", failures);
            Expect(report?.AmsiAvailable != true || page?["ice"]?["amsi"]?.GetValue<string>().StartsWith("CLEAN", StringComparison.Ordinal) == true, "AMSI panel", failures);
            Expect(page?["ice"]?["host"]?.GetValue<string>().EndsWith("/ SMARTSCREEN", StringComparison.Ordinal) == true, "SmartScreen", failures);
            Expect(result["fetch"]?.ToJsonString() == "[404,404,200]", "unlisted files refused", failures);
            Expect(voice?["states"]?.ToJsonString() == """["start","complete"]""", "transmission completed", failures);
            Expect(
                log.Contains("Automation handle · Mimic 3 Amy", StringComparison.Ordinal)
                    && !log.Contains("Local Amy unavailable", StringComparison.Ordinal)
                    && voice?["engine"]?.GetValue<string>() == "MIMIC 3 / AMY MEDIUM",
                "Piper Amy voice (no fallback)",
                failures);
            Expect(lipSync is not null && !IsRest(lipSync), "viseme lip sync", failures);
            Expect(result["whiteIce"]?["cspViolations"]?.GetValue<int>() == 0, "no CSP violations", failures);
            Expect(result["whiteIce"]?["blocked"]?.GetValue<int>() == 0, "no blocked host messages", failures);
        }
        catch (Exception error)
        {
            // Smoke mode reports every failure in its result file instead of showing a crash dialog.
            failures.Add($"error: {error.GetType().Name}: {error.Message}");
        }

        result["failures"] = new JsonArray([.. failures.Select(failure => (JsonNode?)failure)]);
        result["ok"] = failures.Count == 0;
        FinishSmoke(result, failures.Count == 0 ? 0 : 1);
    }

    private static void Expect(bool condition, string name, List<string> failures)
    {
        if (!condition)
        {
            failures.Add(name);
        }
    }

    private static bool IsRest(string viseme) => viseme.StartsWith("VISEME / REST", StringComparison.Ordinal);

    // Mid-speech screenshot next to the smoke report (result.json -> result.png).
    private async Task CaptureAsync()
    {
        if (options.SmokeOut is null)
        {
            return;
        }

        await using var png = File.Create(Path.ChangeExtension(options.SmokeOut, ".png"));
        await webView.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, png);
    }

    private async Task<JsonNode?> EvaluateJson(string expression)
    {
        var raw = await webView.CoreWebView2.ExecuteScriptAsync($"JSON.stringify({expression})");
        var text = JsonSerializer.Deserialize<string>(raw);
        return text is null ? null : JsonNode.Parse(text);
    }

    private void FinishSmoke(JsonObject result, int code)
    {
        if (finished)
        {
            return;
        }

        finished = true;
        ExitCode = code;
        if (options.SmokeOut is not null)
        {
            File.WriteAllText(options.SmokeOut, result.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }

        BeginInvoke(new Action(Close));
    }
}
