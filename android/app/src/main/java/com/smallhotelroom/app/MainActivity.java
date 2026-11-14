package com.smallhotelroom.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * @file android/app/src/main/java/com/smallhotelroom/app/MainActivity.java
 * @version 1.5.0
 * Streams incoming ACTION_VIEW ("Open with..."), ACTION_SEND ("Share to..."),
 * AND native Settings file-picker .db files via a 64 KB buffer so 170MB+ databases load effortlessly.
 */
public class MainActivity extends BridgeActivity {

    private ActivityResultLauncher<Intent> dbFilePickerLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Register native file picker launcher for the Settings screen button
        dbFilePickerLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                result -> {
                    if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                        Uri uri = result.getData().getData();
                        if (uri != null) {
                            streamUriToCacheAndDispatch(uri);
                        }
                    }
                }
        );

        // Expose window.AcordismoNative.pickDatabaseFile() to the WebView
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new AcordismoNativeBridge(), "AcordismoNative");
        }

        handleIncomingDbIntent(getIntent());
    }

    public class AcordismoNativeBridge {
        @JavascriptInterface
        public void pickDatabaseFile() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                dbFilePickerLauncher.launch(intent);
            });
        }
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

        intent.setAction(null);
        streamUriToCacheAndDispatch(uri);
    }

    private void streamUriToCacheAndDispatch(final Uri targetUri) {
        new Thread(() -> {
            File tempFile = new File(getCacheDir(), "shr_shared_import.db");
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
                            showToastOnUi("Ignored file: too small to be a Small Hotel Room database.");
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
