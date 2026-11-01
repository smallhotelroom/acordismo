package com.smallhotelroom.acordismo;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * MainActivity v1.2.0
 * Handles Android ACTION_VIEW ("Open with...") and ACTION_SEND ("Share to...") intents
 * for SQLite .db songbook packs sent via WhatsApp, Telegram, Google Drive, or Files.
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
            try (InputStream is = getContentResolver().openInputStream(targetUri)) {
                if (is == null) {
                    return;
                }
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[16384];
                int nRead;
                while ((nRead = is.read(chunk, 0, chunk.length)) != -1) {
                    buffer.write(chunk, 0, nRead);
                }
                byte[] bytes = buffer.toByteArray();

                // Verify SQLite 3 magic header ("SQLite format 3\0")
                if (bytes.length < 16) {
                    showToastOnUi("Ignored file: too small to be an Acordismo database.");
                    return;
                }
                String magic = new String(bytes, 0, 15, StandardCharsets.US_ASCII);
                if (!"SQLite format 3".equals(magic)) {
                    showToastOnUi("Ignored file: not a valid SQLite .db pack.");
                    return;
                }

                String fileName = resolveFileName(targetUri);
                String base64Data = Base64.encodeToString(bytes, Base64.NO_WRAP);

                JSONObject detailObj = new JSONObject();
                detailObj.put("name", fileName);
                detailObj.put("base64", base64Data);
                final String jsPayload = detailObj.toString();

                // Dispatch into WebView once bridge is ready
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
            Toast.makeText(this, "Loaded database pack: " + fileName, Toast.LENGTH_LONG).show();
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
