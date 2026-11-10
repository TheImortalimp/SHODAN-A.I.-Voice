using System.Runtime.InteropServices;

namespace ShodanDesktop;

internal enum AmsiVerdict
{
    Clean,
    Detected,
    Failed,
}

/// <summary>
/// Microsoft Defender hook. Script content is handed to the Antimalware Scan Interface (AMSI),
/// which forwards it to the registered antivirus engine (normally Microsoft Defender) before the
/// content is allowed to run.
/// </summary>
internal sealed class AmsiScanner : IDisposable
{
    // AMSI_RESULT_BLOCKED_BY_ADMIN_START; AMSI_RESULT_DETECTED (32768) and above is malware.
    private const int BlockedThreshold = 0x4000;

    private IntPtr context;
    private IntPtr session;

    private AmsiScanner()
    {
    }

    public bool Available => context != IntPtr.Zero;

    public static AmsiScanner Create(string appName)
    {
        var scanner = new AmsiScanner();
        try
        {
            if (NativeMethods.AmsiInitialize(appName, out var amsiContext) >= 0 && amsiContext != IntPtr.Zero)
            {
                scanner.context = amsiContext;
                if (NativeMethods.AmsiOpenSession(amsiContext, out var amsiSession) >= 0)
                {
                    scanner.session = amsiSession;
                }
            }
        }
        catch (Exception error) when (error is DllNotFoundException or EntryPointNotFoundException)
        {
            // AMSI is not present on this system; the report says so instead of failing.
        }

        return scanner;
    }

    public AmsiVerdict Scan(byte[] content, string contentName)
    {
        if (!Available)
        {
            return AmsiVerdict.Failed;
        }

        var hr = NativeMethods.AmsiScanBuffer(context, content, (uint)content.Length, contentName, session, out var result);
        if (hr < 0)
        {
            return AmsiVerdict.Failed;
        }

        return result >= BlockedThreshold ? AmsiVerdict.Detected : AmsiVerdict.Clean;
    }

    public void Dispose()
    {
        if (context == IntPtr.Zero)
        {
            return;
        }

        if (session != IntPtr.Zero)
        {
            NativeMethods.AmsiCloseSession(context, session);
        }

        NativeMethods.AmsiUninitialize(context);
        context = IntPtr.Zero;
        session = IntPtr.Zero;
    }

    private static class NativeMethods
    {
        [DllImport("amsi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        public static extern int AmsiInitialize(string appName, out IntPtr amsiContext);

        [DllImport("amsi.dll", ExactSpelling = true)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        public static extern void AmsiUninitialize(IntPtr amsiContext);

        [DllImport("amsi.dll", ExactSpelling = true)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        public static extern int AmsiOpenSession(IntPtr amsiContext, out IntPtr amsiSession);

        [DllImport("amsi.dll", ExactSpelling = true)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        public static extern void AmsiCloseSession(IntPtr amsiContext, IntPtr amsiSession);

        [DllImport("amsi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
        [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
        public static extern int AmsiScanBuffer(IntPtr amsiContext, byte[] buffer, uint length, string contentName, IntPtr amsiSession, out int result);
    }
}
