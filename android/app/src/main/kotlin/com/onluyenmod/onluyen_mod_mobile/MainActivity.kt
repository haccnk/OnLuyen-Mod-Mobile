package com.onluyenmod.onluyen_mod_mobile

import android.webkit.CookieManager
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onPause() {
        super.onPause()
        flushWebCookies()
    }

    override fun onStop() {
        super.onStop()
        flushWebCookies()
    }

    private fun flushWebCookies() {
        try {
            CookieManager.getInstance().flush()
        } catch (_: Throwable) {
        }
    }
}
