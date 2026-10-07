// "Apply Assistant.exe": starts the app server (node src/app.js) without a console window and shows the app in
// its own frameless, Windows 98-style window (WebView2, built into Windows 11). If WebView2 isn't available it falls
// back to letting the server open a Chrome app window.
// Built by `npm run build-exe` with the C# compiler that ships with Windows.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

static class Launcher
{
    public const string Title = "Apply Assistant";
    public static readonly string Dir = AppDomain.CurrentDomain.BaseDirectory;
    public static readonly string LibDir = Path.Combine(Dir, Path.Combine("lib", "webview2"));
    static readonly List<string> recent = new List<string>();
    static StreamWriter log;

    [DllImport("shcore.dll")] static extern int SetProcessDpiAwareness(int value);
    [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

    [STAThread]
    static int Main()
    {
        try { SetProcessDpiAwareness(2); }
        catch (Exception) { try { SetProcessDPIAware(); } catch (Exception) { } }
        AppDomain.CurrentDomain.AssemblyResolve += ResolveFromLib;
        Application.EnableVisualStyles();

        string app = Path.Combine(Dir, Path.Combine("src", "app.js"));
        if (!File.Exists(app))
        {
            Fail("Couldn't find src\\app.js.\n\nKeep \"Apply Assistant.exe\" inside the Job Apply Script folder (use a shortcut to put it on your Desktop).");
            return 1;
        }
        if (!Directory.Exists(Path.Combine(Dir, Path.Combine("node_modules", "playwright"))))
        {
            Fail("Setup isn't finished. Open a terminal in the Job Apply Script folder and run:\n\nnpm install");
            return 1;
        }
        string node = FindNode();
        if (node == null)
        {
            Fail("Node.js isn't installed. Download it from https://nodejs.org, then try again.");
            return 1;
        }

        string logPath = Path.Combine(Dir, Path.Combine("data", "app.log"));
        Directory.CreateDirectory(Path.GetDirectoryName(logPath));
        log = new StreamWriter(new FileStream(logPath, FileMode.Create, FileAccess.Write, FileShare.ReadWrite), new UTF8Encoding(false));
        log.AutoFlush = true;

        bool canHost = File.Exists(Path.Combine(LibDir, "Microsoft.Web.WebView2.WinForms.dll"));
        int code = canHost ? RunHosted(node, app) : RunInBrowser(node, app);
        lock (recent) log.Close();
        return code;
    }

    // ---- node process ----
    static Process StartNode(string node, string app, bool hosted, Action<string> onLine)
    {
        ProcessStartInfo psi = new ProcessStartInfo(node, "\"" + app + "\"");
        psi.WorkingDirectory = Dir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;
        if (hosted) psi.EnvironmentVariables["APPLY_ASSISTANT_NO_WINDOW"] = "1";

        Process p = Process.Start(psi);
        DataReceivedEventHandler handler = (s, e) =>
        {
            if (e.Data == null) return;
            lock (recent)
            {
                log.WriteLine(e.Data);
                recent.Add(e.Data);
                if (recent.Count > 15) recent.RemoveAt(0);
            }
            if (onLine != null) onLine(e.Data);
        };
        p.OutputDataReceived += handler;
        p.ErrorDataReceived += handler;
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return p;
    }

    static string RecentLog()
    {
        lock (recent) return recent.Count > 0 ? string.Join("\n", recent.ToArray()) : "(no details)";
    }

    static int RunInBrowser(string node, string app)
    {
        Process p = StartNode(node, app, false, null);
        p.WaitForExit();
        if (p.ExitCode != 0) Fail("Apply Assistant stopped because of an error:\n\n" + RecentLog() + "\n\nFull details: data\\app.log");
        return p.ExitCode;
    }

    static int RunHosted(string node, string app)
    {
        string url = null;
        ManualResetEvent ready = new ManualResetEvent(false);
        Process p = StartNode(node, app, true, line =>
        {
            if (url == null && line.StartsWith("UI: ")) { url = line.Substring(4).Trim(); ready.Set(); }
        });

        DateTime started = DateTime.Now;
        while (!ready.WaitOne(200))
        {
            if (p.HasExited)
            {
                p.WaitForExit();
                // Exit code 0 here means another copy is already running and was brought to the front.
                if (p.ExitCode != 0) Fail("Apply Assistant couldn't start:\n\n" + RecentLog() + "\n\nFull details: data\\app.log");
                return p.ExitCode;
            }
            if ((DateTime.Now - started).TotalSeconds > 60)
            {
                try { p.Kill(); } catch (Exception) { }
                Fail("Apply Assistant took too long to start.\n\n" + RecentLog());
                return 1;
            }
        }

        bool fallback = ShowWindow(url, p);
        if (fallback)
        {
            // WebView2 didn't work: show the app in a Chrome/Edge app window instead and wait for it to finish.
            OpenBrowserWindow(url);
            p.WaitForExit();
            return p.ExitCode;
        }
        QuitServer(url);
        if (!p.WaitForExit(15000)) { try { p.Kill(); } catch (Exception) { } }
        return 0;
    }

    // Kept separate so WebView2 types load only after ResolveFromLib is in place.
    [MethodImpl(MethodImplOptions.NoInlining)]
    static bool ShowWindow(string url, Process server)
    {
        AppForm form = new AppForm(url, Path.Combine(Dir, "browser-profile-ui"));
        server.EnableRaisingEvents = true;
        server.Exited += (s, e) =>
        {
            if (form.IsDisposed || form.IsClosing) return;
            try
            {
                form.BeginInvoke(new Action(() =>
                {
                    if (server.ExitCode != 0) Fail("Apply Assistant stopped because of an error:\n\n" + RecentLog() + "\n\nFull details: data\\app.log");
                    form.Close();
                }));
            }
            catch (InvalidOperationException) { }
        };
        Application.Run(form);
        return form.FellBack;
    }

    static void QuitServer(string url)
    {
        try
        {
            Uri u = new Uri(url);
            string token = "";
            foreach (string part in u.Query.TrimStart('?').Split('&'))
                if (part.StartsWith("t=")) token = part.Substring(2);
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(u.GetLeftPart(UriPartial.Authority) + "/api/quit");
            req.Method = "POST";
            req.ContentType = "application/json";
            req.Headers["x-token"] = token;
            req.Timeout = 5000;
            byte[] body = Encoding.UTF8.GetBytes("{}");
            req.ContentLength = body.Length;
            using (Stream st = req.GetRequestStream()) st.Write(body, 0, body.Length);
            using (WebResponse res = req.GetResponse()) { }
        }
        catch (Exception) { }
    }

    static void OpenBrowserWindow(string url)
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] candidates = {
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
        };
        foreach (string exe in candidates)
        {
            if (!File.Exists(exe)) continue;
            Process.Start(exe, "--app=\"" + url + "\" --user-data-dir=\"" + Path.Combine(Dir, "browser-profile-ui") + "\" --window-size=1180,840 --no-first-run --no-default-browser-check");
            return;
        }
        Process.Start(url);
    }

    static Assembly ResolveFromLib(object sender, ResolveEventArgs args)
    {
        string file = Path.Combine(LibDir, new AssemblyName(args.Name).Name + ".dll");
        return File.Exists(file) ? Assembly.LoadFrom(file) : null;
    }

    static string FindNode()
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string part in path.Split(';'))
        {
            try
            {
                string candidate = Path.Combine(part.Trim().Trim('"'), "node.exe");
                if (File.Exists(candidate)) return candidate;
            }
            catch (ArgumentException) { }
        }
        string fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Path.Combine("nodejs", "node.exe"));
        return File.Exists(fallback) ? fallback : null;
    }

    public static void Fail(string message)
    {
        MessageBox.Show(message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
    }
}

// A borderless window: the page draws the Windows 98 title bar; this form paints the 3D border and handles
// moving, resizing, minimize/maximize/close.
class AppForm : Form
{
    readonly string url;
    readonly string userData;
    readonly Microsoft.Web.WebView2.WinForms.WebView2 web;
    readonly int grip;
    public bool FellBack;
    public bool IsClosing;

    static readonly Color Face = Color.FromArgb(192, 192, 192);

    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    public AppForm(string url, string userData)
    {
        this.url = url;
        this.userData = userData;
        Text = Launcher.Title;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
        FormBorderStyle = FormBorderStyle.None;
        BackColor = Face;
        DoubleBuffered = true;
        ResizeRedraw = true;
        StartPosition = FormStartPosition.CenterScreen;

        float scale;
        using (Graphics g = CreateGraphics()) scale = g.DpiX / 96f;
        grip = (int)Math.Round(4 * scale);
        Padding = new Padding(grip);
        Size = new Size((int)(1180 * scale), (int)(840 * scale));
        MinimumSize = new Size((int)(760 * scale), (int)(520 * scale));

        web = new Microsoft.Web.WebView2.WinForms.WebView2();
        web.Dock = DockStyle.Fill;
        web.DefaultBackgroundColor = Face;
        Controls.Add(web);

        Load += async (s, e) => await Init();
        FormClosing += (s, e) => { IsClosing = true; };
        Resize += (s, e) => Notify(WindowState == FormWindowState.Maximized ? "maximized" : "normal");
    }

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams cp = base.CreateParams;
            cp.Style |= 0x20000 | 0x10000; // WS_MINIMIZEBOX | WS_MAXIMIZEBOX: taskbar minimize, Win+arrow snapping
            return cp;
        }
    }

    async Task Init()
    {
        try
        {
            Microsoft.Web.WebView2.Core.CoreWebView2Environment.SetLoaderDllFolderPath(Launcher.LibDir);
            Microsoft.Web.WebView2.Core.CoreWebView2Environment env =
                await Microsoft.Web.WebView2.Core.CoreWebView2Environment.CreateAsync(null, userData);
            await web.EnsureCoreWebView2Async(env);
            Microsoft.Web.WebView2.Core.CoreWebView2 core = web.CoreWebView2;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            try { core.Settings.IsNonClientRegionSupportEnabled = true; } catch (Exception) { } // lets "app-region: drag" move the window
            core.NewWindowRequested += (s, e) =>
            {
                e.Handled = true;
                try { Process.Start(e.Uri); } catch (Exception) { }
            };
            core.WebMessageReceived += (s, e) =>
            {
                string m;
                try { m = e.TryGetWebMessageAsString(); } catch (Exception) { return; }
                OnPageMessage(m);
            };
            core.Navigate(url);
        }
        catch (Exception)
        {
            FellBack = true;
            Close();
        }
    }

    void Notify(string message)
    {
        try { if (web != null && web.CoreWebView2 != null) web.CoreWebView2.PostWebMessageAsString(message); } catch (Exception) { }
    }

    void OnPageMessage(string m)
    {
        switch (m)
        {
            case "drag":
                if (WindowState == FormWindowState.Maximized) return;
                ReleaseCapture();
                SendMessage(Handle, 0xA1, (IntPtr)2, IntPtr.Zero); // WM_NCLBUTTONDOWN on the caption
                break;
            case "max": ToggleMaximize(); break;
            case "min": WindowState = FormWindowState.Minimized; break;
            case "close": Close(); break;
            case "focus":
                if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
                Activate();
                break;
        }
    }

    void ToggleMaximize()
    {
        if (WindowState == FormWindowState.Maximized) { WindowState = FormWindowState.Normal; return; }
        Screen screen = Screen.FromHandle(Handle);
        Rectangle wa = screen.WorkingArea;
        Rectangle b = screen.Bounds;
        MaximizedBounds = new Rectangle(wa.X - b.X, wa.Y - b.Y, wa.Width, wa.Height); // don't cover the taskbar
        WindowState = FormWindowState.Maximized;
    }

    // Classic raised window border.
    protected override void OnPaint(PaintEventArgs e)
    {
        Graphics g = e.Graphics;
        int w = ClientSize.Width - 1, h = ClientSize.Height - 1;
        g.Clear(Face);
        using (Pen light = new Pen(Color.FromArgb(223, 223, 223)))
        using (Pen white = new Pen(Color.White))
        using (Pen gray = new Pen(Color.FromArgb(128, 128, 128)))
        using (Pen dark = new Pen(Color.FromArgb(10, 10, 10)))
        {
            g.DrawLine(light, 0, 0, w, 0); g.DrawLine(light, 0, 0, 0, h);
            g.DrawLine(dark, 0, h, w, h); g.DrawLine(dark, w, 0, w, h);
            g.DrawLine(white, 1, 1, w - 1, 1); g.DrawLine(white, 1, 1, 1, h - 1);
            g.DrawLine(gray, 1, h - 1, w - 1, h - 1); g.DrawLine(gray, w - 1, 1, w - 1, h - 1);
        }
    }

    // Let the border act as resize handles.
    protected override void WndProc(ref Message m)
    {
        const int WM_NCHITTEST = 0x84;
        if (m.Msg == WM_NCHITTEST && WindowState == FormWindowState.Normal)
        {
            long lp = m.LParam.ToInt64();
            Point p = PointToClient(new Point((short)(lp & 0xFFFF), (short)((lp >> 16) & 0xFFFF)));
            int g = grip + 2;
            bool l = p.X < g, r = p.X >= ClientSize.Width - g, t = p.Y < g, b = p.Y >= ClientSize.Height - g;
            int hit = 0;
            if (t && l) hit = 13; else if (t && r) hit = 14; else if (b && l) hit = 16; else if (b && r) hit = 17;
            else if (l) hit = 10; else if (r) hit = 11; else if (t) hit = 12; else if (b) hit = 15;
            if (hit != 0) { m.Result = (IntPtr)hit; return; }
        }
        base.WndProc(ref m);
    }
}
