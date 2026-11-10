namespace ShodanDesktop;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        HostOptions options;
        try
        {
            options = HostOptions.Parse(args);
        }
        catch (ArgumentException error)
        {
            MessageBox.Show(error.Message, "SHODAN Voice", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 64;
        }

        ApplicationConfiguration.Initialize();
        using var form = new MainForm(options);
        Application.Run(form);
        return form.ExitCode;
    }
}

/// <summary>Command line: <c>--smoke-test [--smoke-out result.json] [--user-data folder]</c>.</summary>
internal sealed record HostOptions(bool SmokeTest, string? SmokeOut, string? UserDataFolder)
{
    public static HostOptions Parse(IReadOnlyList<string> args)
    {
        var smoke = false;
        string? smokeOut = null;
        string? userData = null;
        for (var i = 0; i < args.Count; i++)
        {
            switch (args[i])
            {
                case "--smoke-test":
                    smoke = true;
                    break;
                case "--smoke-out":
                    smokeOut = Path.GetFullPath(ValueOf(args, ref i));
                    break;
                case "--user-data":
                    userData = Path.GetFullPath(ValueOf(args, ref i));
                    break;
                default:
                    throw new ArgumentException($"Unknown option: {args[i]}");
            }
        }

        return new HostOptions(smoke, smokeOut, userData);
    }

    private static string ValueOf(IReadOnlyList<string> args, ref int index)
    {
        var option = args[index];
        if (++index >= args.Count || args[index].StartsWith("--", StringComparison.Ordinal))
        {
            throw new ArgumentException($"{option} needs a value.");
        }

        return args[index];
    }
}
