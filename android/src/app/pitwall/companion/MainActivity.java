package app.pitwall.companion;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.util.concurrent.atomic.AtomicInteger;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Pitwall companion. The interface is bundled in the app (assets/www) and served under its own address, so it opens
 * and works with the computer off; a copy of the career is kept on the device and synced with Pitwall on the
 * computer whenever it can be reached. The native side finds the computer, stores that copy, and adds what a
 * WebView lacks (saving and picking files, the back button, keeping the screen on while you log).
 */
public class MainActivity extends Activity {
    static final int PORT = 8765;
    static final int FILE_REQUEST = 1;
    static final String APP_HOST = "app.pitwall";
    static final String APP = "http://" + APP_HOST + "/";
    static final String ACTION_INSTALLED = "app.pitwall.companion.INSTALLED";

    WebView web;
    SharedPreferences prefs;
    ValueCallback<Uri[]> fileCallback;
    final Handler main = new Handler(Looper.getMainLooper());
    String host; // the computer, "192.168.1.20:8765"
    volatile boolean scanning = false;
    volatile boolean updating = false;
    final AtomicInteger listenGen = new AtomicInteger();

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        int bg = Color.parseColor("#0B0F17");
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(bg);

        prefs = getSharedPreferences("pitwall", MODE_PRIVATE);
        host = prefs.getString("host", null);

        // inspectable from Chrome only in a debug build (android/build.ps1 -Debug)
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web = new WebView(this);
        web.setBackgroundColor(bg);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.addJavascriptInterface(new Bridge(), "PitwallAndroid");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        web.loadUrl(host != null ? APP + "index.html" : APP + "connect.html");
    }

    void showConnect(String message) { web.loadUrl(APP + "connect.html#" + Uri.encode(message == null ? "" : message)); }

    void js(final String code) { main.post(() -> web.evaluateJavascript(code, null)); }

    void toast(final String text) { main.post(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show()); }

    File cacheFile() { return new File(getFilesDir(), "career-cache.json"); }

    File updateFile() { return new File(getCacheDir(), "update.apk"); }

    /** Android's installer reporting back: ask you to confirm when it needs to, say so if it failed. */
    @Override
    @SuppressWarnings("deprecation")
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (!ACTION_INSTALLED.equals(intent.getAction())) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); try { startActivity(confirm); } catch (Exception ignored) { } }
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            js("window.__pw && window.__pw.updateFailed(" + JSONObject.quote(msg == null ? "Android didn't install it" : msg) + ")");
        }
    }

    /** "192.168.1.20", "192.168.1.20:8765" or "http://192.168.1.20:8765/" → "192.168.1.20:8765". */
    static String normalise(String raw) {
        String h = raw == null ? "" : raw.trim();
        h = h.replaceFirst("^[a-zA-Z]+://", "");
        int slash = h.indexOf('/');
        if (slash >= 0) h = h.substring(0, slash);
        if (h.isEmpty()) return "";
        if (!h.contains(":")) h = h + ":" + PORT;
        return h;
    }

    /** Pitwall's hello ({ name, id, build }) if it answers at this address, otherwise null. */
    static JSONObject hello(String h, int timeout) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + h + "/api/hello").openConnection();
            c.setConnectTimeout(timeout);
            c.setReadTimeout(timeout);
            if (c.getResponseCode() != 200) return null;
            JSONObject o = new JSONObject(new String(readAll(c.getInputStream()), StandardCharsets.UTF_8));
            return o.optBoolean("pitwall") ? o : null;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] b = new byte[16384];
        int n;
        while ((n = in.read(b)) > 0) buf.write(b, 0, n);
        in.close();
        return buf.toByteArray();
    }

    /** Every address in this device's Wi-Fi network (the /24 around its own address) that answers as Pitwall. */
    JSONArray scanNetwork() {
        List<String> prefixes = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || !a.isSiteLocalAddress()) continue;
                    String ip = a.getHostAddress();
                    String prefix = ip.substring(0, ip.lastIndexOf('.') + 1);
                    if (!prefixes.contains(prefix)) prefixes.add(prefix);
                }
            }
        } catch (Exception ignored) { }
        final JSONArray found = new JSONArray();
        ExecutorService pool = Executors.newFixedThreadPool(48);
        for (String prefix : prefixes) {
            for (int i = 1; i < 255; i++) {
                final String h = prefix + i + ":" + PORT;
                pool.submit(() -> {
                    JSONObject o = hello(h, 700);
                    if (o != null) synchronized (found) {
                        try { found.put(new JSONObject().put("host", h).put("name", o.optString("name", "Computer")).put("id", o.optString("id"))); } catch (Exception ignored) { }
                    }
                });
            }
        }
        pool.shutdown();
        try { pool.awaitTermination(20, TimeUnit.SECONDS); } catch (InterruptedException ignored) { }
        if (prefixes.isEmpty()) found.put(JSONObject.NULL); // marker: not on Wi-Fi
        return found;
    }

    /** Remember the computer. A different computer (not just a new address) starts this device afresh. */
    void useComputer(String h, String id) {
        String known = prefs.getString("serverId", null);
        SharedPreferences.Editor e = prefs.edit().putString("host", h);
        if (id != null && !id.isEmpty() && !id.equals(known)) {
            if (known != null) { cacheFile().delete(); e.remove("key"); }
            e.putString("serverId", id);
        }
        e.apply();
        host = h;
    }

    class Bridge {
        @JavascriptInterface public String host() { return host == null ? "" : host; }

        @JavascriptInterface public String getKey() { return prefs.getString("key", ""); }

        @JavascriptInterface public void setKey(String k) { prefs.edit().putString("key", k == null ? "" : k).apply(); }

        /** The device's copy of the career (with the last version agreed with the computer). */
        @JavascriptInterface public String readCache() {
            try { return new String(readAll(new FileInputStream(cacheFile())), StandardCharsets.UTF_8); } catch (Exception e) { return ""; }
        }

        @JavascriptInterface public boolean writeCache(String json) {
            File f = cacheFile(), tmp = new File(f.getPath() + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (Exception e) { return false; }
            return tmp.renameTo(f);
        }

        @JavascriptInterface public void connect(final String raw) {
            final String h = normalise(raw);
            new Thread(() -> {
                final JSONObject o = h.isEmpty() ? null : hello(h, 3000);
                main.post(() -> {
                    if (o != null) {
                        useComputer(h, o.optString("id"));
                        web.loadUrl(APP + "index.html");
                    } else {
                        web.evaluateJavascript("window.connectFailed && connectFailed(" + JSONObject.quote(h) + ")", null);
                    }
                });
            }).start();
        }

        @JavascriptInterface public void scan() {
            new Thread(() -> {
                JSONArray found = scanNetwork();
                boolean wifi = !(found.length() > 0 && found.isNull(found.length() - 1));
                if (!wifi) found.remove(found.length() - 1);
                js("window.scanDone && scanDone(" + found.toString() + ", " + wifi + ")");
            }).start();
        }

        /** The computer stopped answering: look for the same computer at a new address. */
        @JavascriptInterface public void rediscover() {
            final String id = prefs.getString("serverId", null);
            if (id == null || scanning) return;
            scanning = true;
            new Thread(() -> {
                try {
                    JSONArray found = scanNetwork();
                    for (int i = 0; i < found.length(); i++) {
                        JSONObject o = found.optJSONObject(i);
                        if (o != null && id.equals(o.optString("id")) && !o.optString("host").equals(host)) {
                            final String h = o.optString("host");
                            main.post(() -> { useComputer(h, id); web.evaluateJavascript("window.pitwallHostChanged && pitwallHostChanged(" + JSONObject.quote(h) + ")", null); });
                            break;
                        }
                    }
                } finally { scanning = false; }
            }).start();
        }

        /**
         * An HTTP call to the computer, made here rather than in the WebView: the WebView's connections to a computer
         * that went away can stay stuck after it comes back. Answers through window.__pw.done(id, status, body);
         * status 0 means the computer couldn't be reached.
         */
        @JavascriptInterface public void request(final String id, final String method, final String path, final String body, final int timeout) {
            final String h = host;
            new Thread(() -> {
                int status = 0;
                String text = "";
                HttpURLConnection c = null;
                try {
                    if (h == null) throw new IOException("no computer");
                    c = (HttpURLConnection) new URL("http://" + h + path).openConnection();
                    c.setConnectTimeout(Math.min(timeout, 4000));
                    c.setReadTimeout(timeout);
                    c.setRequestMethod(method);
                    String key = prefs.getString("key", "");
                    if (!key.isEmpty()) c.setRequestProperty("x-pitwall-key", key);
                    if (body != null) {
                        byte[] b = body.getBytes(StandardCharsets.UTF_8);
                        c.setDoOutput(true);
                        c.setRequestProperty("content-type", "application/json");
                        c.setFixedLengthStreamingMode(b.length);
                        try (OutputStream o = c.getOutputStream()) { o.write(b); }
                    }
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    text = in == null ? "" : new String(readAll(in), StandardCharsets.UTF_8);
                } catch (Exception e) {
                    status = 0;
                    text = String.valueOf(e.getMessage());
                } finally {
                    if (c != null) c.disconnect();
                }
                js("window.__pw && __pw.done(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(text) + ")");
            }).start();
        }

        /** The live link: follows the computer's event stream and reconnects every few seconds while it's away. */
        @JavascriptInterface public void listen() {
            final int gen = listenGen.incrementAndGet();
            new Thread(() -> {
                while (gen == listenGen.get()) {
                    HttpURLConnection c = null;
                    String key = prefs.getString("key", "");
                    try {
                        if (host != null && !key.isEmpty()) {
                            c = (HttpURLConnection) new URL("http://" + host + "/api/events?k=" + Uri.encode(key)).openConnection();
                            c.setConnectTimeout(3000);
                            c.setReadTimeout(45000); // the computer sends a heartbeat every 20 s
                            if (c.getResponseCode() == 200) {
                                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8));
                                String line, event = "message";
                                StringBuilder data = new StringBuilder();
                                while (gen == listenGen.get() && (line = r.readLine()) != null) {
                                    if (line.isEmpty()) {
                                        if (data.length() > 0) js("window.__pw && __pw.event(" + JSONObject.quote(event) + "," + JSONObject.quote(data.toString()) + ")");
                                        event = "message";
                                        data.setLength(0);
                                    } else if (line.startsWith("event:")) event = line.substring(6).trim();
                                    else if (line.startsWith("data:")) data.append(line.substring(5).trim());
                                }
                            }
                        }
                    } catch (Exception ignored) {
                    } finally {
                        if (c != null) c.disconnect();
                    }
                    if (gen != listenGen.get()) break;
                    js("window.__pw && __pw.event('down','')");
                    try { Thread.sleep(3000); } catch (InterruptedException e) { break; }
                }
            }).start();
        }

        @JavascriptInterface public void changeComputer() { main.post(() -> showConnect("")); }

        @JavascriptInterface public String lastHost() { return host == null ? "" : host; }

        /**
         * Updates. The computer serves the app that came with its version of Pitwall (/app); this downloads it into
         * the app's own storage, reporting progress to the page, and installUpdate hands it to Android's installer.
         * The first time, Android asks to allow installs from Pitwall and to confirm; once Pitwall has installed
         * itself, Android 12 and later let it update without asking.
         */
        @JavascriptInterface public boolean canUpdate() { return true; }

        @JavascriptInterface public void downloadUpdate() {
            final String h = host;
            if (updating || h == null) return;
            updating = true;
            new Thread(() -> {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL("http://" + h + "/app").openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(30000);
                    if (c.getResponseCode() != 200) throw new IOException("the computer said " + c.getResponseCode());
                    long total = c.getContentLengthLong(), got = 0; int last = -1;
                    File tmp = new File(getCacheDir(), "update.part");
                    try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                        byte[] b = new byte[65536]; int n;
                        while ((n = in.read(b)) > 0) {
                            out.write(b, 0, n); got += n;
                            int pct = total > 0 ? (int) (got * 100 / total) : -1;
                            if (pct != last) { last = pct; js("window.__pw && window.__pw.updateProgress(" + pct + ")"); }
                        }
                    }
                    if (total > 0 && got != total) throw new IOException("the download was incomplete");
                    File apk = updateFile(); apk.delete();
                    if (!tmp.renameTo(apk)) throw new IOException("couldn't keep the download");
                    js("window.__pw && window.__pw.updateReady()");
                } catch (Exception e) {
                    js("window.__pw && window.__pw.updateFailed(" + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                } finally {
                    if (c != null) c.disconnect();
                    updating = false;
                }
            }).start();
        }

        @JavascriptInterface public void installUpdate() {
            new Thread(() -> {
                try {
                    File apk = updateFile();
                    if (!apk.exists()) throw new IOException("nothing downloaded");
                    PackageInstaller pi = getPackageManager().getPackageInstaller();
                    PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                    sp.setAppPackageName(getPackageName());
                    if (Build.VERSION.SDK_INT >= 31) sp.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
                    int id = pi.createSession(sp);
                    try (PackageInstaller.Session session = pi.openSession(id)) {
                        try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("pitwall.apk", 0, apk.length())) {
                            byte[] b = new byte[65536]; int n;
                            while ((n = in.read(b)) > 0) out.write(b, 0, n);
                            session.fsync(out);
                        }
                        Intent done = new Intent(MainActivity.this, MainActivity.class).setAction(ACTION_INSTALLED);
                        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
                        session.commit(PendingIntent.getActivity(MainActivity.this, 7, done, flags).getIntentSender());
                    }
                } catch (Exception e) {
                    js("window.__pw && window.__pw.updateFailed(" + JSONObject.quote(String.valueOf(e.getMessage())) + ")");
                }
            }).start();
        }

        @JavascriptInterface public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }

        /** Save a file the page produced (backup, weekend card) into Downloads/Pitwall. */
        @JavascriptInterface public boolean saveFile(String name, String mime, String base64) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                String safe = name.replaceAll("[^\\w.-]+", "-");
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Pitwall");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new Exception("no storage");
                    try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(bytes); }
                    toast("Saved to Downloads/Pitwall/" + safe);
                } else {
                    File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    File f = new File(dir, safe);
                    try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
                    toast("Saved to " + f.getAbsolutePath());
                }
                return true;
            } catch (Exception e) {
                toast("Could not save: " + e.getMessage());
                return false;
            }
        }
    }

    static String mimeOf(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".json") || path.endsWith(".webmanifest")) return "application/json";
        return "application/octet-stream";
    }

    class Client extends WebViewClient {
        /** The bundled interface, served from the app itself. */
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!APP_HOST.equals(u.getHost())) return null;
            String p = u.getPath();
            if (p == null || p.equals("/") || p.isEmpty()) p = "/index.html";
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            try {
                InputStream in = getAssets().open("www" + p);
                return new WebResourceResponse(mimeOf(p), "UTF-8", 200, "OK", headers, in);
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (APP_HOST.equals(u.getHost())) return false;
            // anything else (the app download, a website) opens in the browser
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException ignored) { }
            return true;
        }
    }

    class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            try {
                startActivityForResult(params.createIntent(), FILE_REQUEST);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == FILE_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    /** Back closes the menu or a dialog, then steps back a page; on the dashboard it leaves the app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.pitwallBack && window.pitwallBack()) ? 1 : 0", v -> {
            if (!"1".equals(v)) moveTaskToBack(true);
        });
    }

    @Override protected void onDestroy() { listenGen.incrementAndGet(); super.onDestroy(); }

    @Override protected void onPause() { super.onPause(); web.onPause(); }

    @Override protected void onResume() { super.onResume(); web.onResume(); }
}
