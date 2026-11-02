package com.smallhotelroom.acordismo;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * MainActivity v1.3.0
 * Streams incoming ACTION_VIEW ("Open with...") and ACTION_SEND ("Share to...") .db files
 * directly to the app cache directory using a 64 KB buffer so 170MB+ databases never OOM.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleIncomingDbIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingDbIntent(intent);
    }

    private void handleIncomingDbIntent(Intent intent) {
        if (intent == null) {
            return;
        }
        String action = intent.getAction();
        Uri uri = null;

        if (Intent.ACTION_VIEW.equals(action)) {
            uri = intent.getData();
        } else if (Intent.ACTION_SEND.equals(action)) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }

        if (uri == null) {
            return;
        }

        // Clear action so screen rotation does not re-import the same intent
        intent.setAction(null);

        final Uri targetUri = uri;
        new Thread(() -> {
            File tempFile = new File(getCacheDir(), "acordismo_shared_import.db");
            try (
                InputStream is = getContentResolver().openInputStream(targetUri);
                FileOutputStream fos = new FileOutputStream(tempFile)
            ) {
                if (is == null) {
                    return;
                }

                byte[] chunk = new byte[65536]; // 64 KB streaming buffer
                int nRead;
                long totalBytes = 0;
                boolean headerChecked = false;

                while ((nRead = is.read(chunk, 0, chunk.length)) != -1) {
                    if (!headerChecked) {
                        if (nRead < 16) {
                            showToastOnUi("Ignored file: too small to be an Acordismo database.");
                            return;
                        }
                        String magic = new String(chunk, 0, 15, StandardCharsets.US_ASCII);
                        if (!"SQLite format 3".equals(magic)) {
                            showToastOnUi("Ignored file: not a valid SQLite .db pack.");
                            return;
                        }
                        headerChecked = true;
                    }
                    fos.write(chunk, 0, nRead);
                    totalBytes += nRead;
                }
                fos.flush();

                if (totalBytes < 16) {
                    showToastOnUi("Ignored empty file.");
                    return;
                }

                String fileName = resolveFileName(targetUri);
                JSONObject detailObj = new JSONObject();
                detailObj.put("name", fileName);
                detailObj.put("path", tempFile.getAbsolutePath());
                final String jsPayload = detailObj.toString();

                runOnUiThread(() -> dispatchDbToWebView(jsPayload, fileName, 0));
            } catch (Exception e) {
                showToastOnUi("Failed to open database: " + e.getMessage());
            }
        }).start();
    }

    private void dispatchDbToWebView(String jsPayload, String fileName, int attempt) {
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebView webView = this.bridge.getWebView();
            String script = "window.__acordismoPendingDb = " + jsPayload + ";" +
                    "window.dispatchEvent(new CustomEvent('acordismo-open-db', { detail: " + jsPayload + " }));";
            webView.evaluateJavascript(script, null);
            Toast.makeText(this, "Importing database pack: " + fileName + "...", Toast.LENGTH_LONG).show();
        } else if (attempt < 20) {
            getWindow().getDecorView().postDelayed(
                    () -> dispatchDbToWebView(jsPayload, fileName, attempt + 1),
                    250
            );
        }
    }

    private String resolveFileName(Uri uri) {
        String result = null;
        if ("content".equals(uri.getScheme())) {
            try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    if (idx >= 0) {
                        result = cursor.getString(idx);
                    }
                }
            } catch (Exception ignored) {
            }
        }
        if (result == null) {
            result = uri.getLastPathSegment();
        }
        if (result == null || result.trim().isEmpty()) {
            result = "whatsapp-pack.db";
        }
        return result;
    }

    private void showToastOnUi(String msg) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show());
    }
}
