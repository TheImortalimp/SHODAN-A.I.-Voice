using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace ShodanDesktop;

/// <summary>
/// WHITE ICE file integrity. Serves the web build from disk, but only files listed in the integrity
/// manifest compiled into this exe. Every file is hashed (SHA-256) at startup and then stays open
/// with <see cref="FileShare.Read"/>, so nothing can modify, replace or delete it while the app runs.
/// </summary>
internal sealed class ContentStore : IDisposable
{
    public const string Host = "shodan-voice.example";
    public const string Origin = "https://" + Host;
    public const string ErrorHeaders = "Content-Type: text/plain; charset=utf-8\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-store";

    private const long MaxScanBytes = 32L * 1024 * 1024;

    private static readonly HashSet<string> ScriptTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ".js", ".mjs", ".html", ".json", ".xml", ".webmanifest",
    };

    private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".mjs"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".webmanifest"] = "application/manifest+json; charset=utf-8",
        [".xml"] = "application/xml; charset=utf-8",
        [".txt"] = "text/plain; charset=utf-8",
        [".wasm"] = "application/wasm",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".svg"] = "image/svg+xml",
        [".ico"] = "image/x-icon",
        [".onnx"] = "application/octet-stream",
        [".data"] = "application/octet-stream",
        [""] = "text/plain; charset=utf-8",
    };

    private readonly Dictionary<string, ManifestFile> files;
    private readonly string headerBlock;
    private readonly List<FileStream> locks = [];

    private ContentStore(string root, Manifest manifest)
    {
        Root = root;
        Version = manifest.Version;
        Entry = manifest.Entry;
        files = new Dictionary<string, ManifestFile>(manifest.Files, StringComparer.Ordinal);
        var headers = new StringBuilder();
        headers.Append("Cache-Control: no-cache\r\n");
        headers.Append("Content-Security-Policy: ").Append(manifest.Csp).Append("\r\n");
        foreach (var (name, value) in manifest.Headers)
        {
            headers.Append(name).Append(": ").Append(value).Append("\r\n");
        }

        headerBlock = headers.ToString();
    }

    public string Root { get; }

    public string Version { get; }

    public string Entry { get; }

    public static ContentStore Load(string root)
    {
        using var stream = typeof(ContentStore).Assembly.GetManifestResourceStream("white-ice.manifest.json")
            ?? throw new InvalidDataException("The integrity manifest is missing from this build.");
        var manifest = JsonSerializer.Deserialize<Manifest>(stream, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidDataException("The integrity manifest is empty.");
        Validate(manifest);
        return new ContentStore(Path.GetFullPath(root), manifest);
    }

    /// <summary>Hashes every listed file, keeps it locked, and asks AMSI to scan script content.</summary>
    public IntegrityReport VerifyAndLock(AmsiScanner amsi)
    {
        var report = new IntegrityReport { Total = files.Count, AmsiAvailable = amsi.Available };
        foreach (var (path, expected) in files.OrderBy(entry => entry.Key, StringComparer.Ordinal))
        {
            try
            {
                var stream = new FileStream(FullPath(path), FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16, FileOptions.SequentialScan);
                locks.Add(stream);
                if (stream.Length != expected.Size || !SHA256.HashData(stream).AsSpan().SequenceEqual(Convert.FromHexString(expected.Sha256)))
                {
                    report.Failed.Add(path);
                    continue;
                }

                report.Verified++;
                if (amsi.Available && ScriptTypes.Contains(Path.GetExtension(path)) && stream.Length <= MaxScanBytes)
                {
                    stream.Position = 0;
                    var content = new byte[stream.Length];
                    stream.ReadExactly(content);
                    var verdict = amsi.Scan(content, $"{Origin}/{path}");
                    if (verdict == AmsiVerdict.Detected)
                    {
                        report.Detections.Add(path);
                    }

                    if (verdict != AmsiVerdict.Failed)
                    {
                        report.Scanned++;
                    }
                }
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            {
                report.Failed.Add(path);
            }
        }

        report.Locked = report.Failed.Count == 0;
        return report;
    }

    /// <summary>Opens a manifest-listed file for a request URL; anything else gets no stream.</summary>
    public FileStream? Open(Uri uri, out string path)
    {
        path = Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/');
        if (path.Length == 0)
        {
            path = Entry;
        }

        if (!files.ContainsKey(path))
        {
            return null;
        }

        return new FileStream(FullPath(path), FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16, FileOptions.SequentialScan);
    }

    public string ResponseHeaders(string path)
    {
        var type = MimeTypes.GetValueOrDefault(Path.GetExtension(path), "application/octet-stream");
        return $"Content-Type: {type}\r\nContent-Length: {files[path].Size}\r\n{headerBlock}";
    }

    public void Dispose()
    {
        foreach (var stream in locks)
        {
            stream.Dispose();
        }

        locks.Clear();
    }

    private static void Validate(Manifest manifest)
    {
        if (manifest.Algorithm != "SHA-256" || manifest.Files is null || manifest.Headers is null
            || string.IsNullOrEmpty(manifest.Csp) || string.IsNullOrEmpty(manifest.Entry) || !manifest.Files.ContainsKey(manifest.Entry))
        {
            throw new InvalidDataException("The integrity manifest is malformed.");
        }

        foreach (var (path, file) in manifest.Files)
        {
            var safePath = path.Length > 0 && !path.Contains('\\') && !path.Contains(':')
                && path.Split('/').All(part => part.Length > 0 && part != "." && part != "..");
            if (!safePath || file is null || file.Size < 0 || file.Sha256 is not { Length: 64 } || !file.Sha256.All(char.IsAsciiHexDigit))
            {
                throw new InvalidDataException($"The integrity manifest has an invalid entry: {path}");
            }
        }

        if (manifest.Headers.Any(header => ContainsLineBreak(header.Key) || ContainsLineBreak(header.Value)) || ContainsLineBreak(manifest.Csp))
        {
            throw new InvalidDataException("The integrity manifest has an invalid header.");
        }
    }

    private static bool ContainsLineBreak(string value) => value.AsSpan().IndexOfAny('\r', '\n') >= 0;

    private string FullPath(string path)
    {
        var full = Path.GetFullPath(Path.Combine(Root, path.Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(Root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException($"{path} is outside the app folder.");
        }

        return full;
    }
}

internal sealed record Manifest(string App, string Version, string Algorithm, string Entry, string Csp, Dictionary<string, string> Headers, Dictionary<string, ManifestFile> Files);

internal sealed record ManifestFile(string Sha256, long Size);

internal sealed class IntegrityReport
{
    public int Total { get; init; }

    public int Verified { get; set; }

    public bool Locked { get; set; }

    public List<string> Failed { get; } = [];

    public bool AmsiAvailable { get; init; }

    public int Scanned { get; set; }

    public List<string> Detections { get; } = [];

    public bool Trusted => Failed.Count == 0 && Detections.Count == 0 && Verified == Total;

    public JsonObject ToJson() => new()
    {
        ["total"] = Total,
        ["verified"] = Verified,
        ["locked"] = Locked,
        ["failed"] = new JsonArray([.. Failed.Select(path => (JsonNode?)path)]),
        ["amsi"] = new JsonObject
        {
            ["available"] = AmsiAvailable,
            ["scanned"] = Scanned,
            ["detections"] = new JsonArray([.. Detections.Select(path => (JsonNode?)path)]),
        },
    };
}
