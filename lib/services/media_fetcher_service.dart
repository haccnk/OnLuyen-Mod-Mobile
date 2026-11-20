import 'dart:async';
import 'dart:convert';

import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:http/http.dart' as http;

class MediaFetcherService {
  static const int maxImageBytes = 4 * 1024 * 1024;
  final http.Client _httpClient;

  MediaFetcherService({http.Client? httpClient}) : _httpClient = httpClient ?? http.Client();

  Future<List<Map<String, dynamic>>> fetchImagesWithCookies({
    required String pageUrl,
    required List<Map<String, dynamic>> items,
    required String userAgent,
  }) async {
    if (items.isEmpty) return const [];

    String cookieHeader = '';
    try {
      final cookies = await CookieManager.instance().getCookies(url: WebUri(pageUrl));
      if (cookies.isNotEmpty) {
        cookieHeader = cookies.map((c) => '${c.name}=${c.value}').join('; ');
      }
    } catch (_) {}

    final results = await Future.wait(
      items.map((item) async {
        final id = (item['id'] ?? '').toString();
        final urlStr = (item['url'] ?? '').toString();
        if (urlStr.isEmpty) {
          return {'id': id, 'ok': false};
        }
        try {
          final uri = Uri.parse(urlStr);
          final headers = <String, String>{
            'User-Agent': userAgent,
            'Referer': pageUrl,
            'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
          };
          if (cookieHeader.isNotEmpty) {
            headers['Cookie'] = cookieHeader;
          }

          final resp = await _httpClient.get(uri, headers: headers).timeout(const Duration(seconds: 8));
          if (resp.statusCode < 200 || resp.statusCode >= 300) {
            return {'id': id, 'ok': false, 'status': resp.statusCode};
          }

          final bytes = resp.bodyBytes;
          if (bytes.isEmpty || bytes.length > maxImageBytes) {
            return {'id': id, 'ok': false};
          }

          final rawType = (resp.headers['content-type'] ?? '').split(';').first.trim().toLowerCase();
          final mimeType = _resolveMimeType(rawType, urlStr);
          if (!mimeType.startsWith('image/') || mimeType == 'image/svg+xml') {
            // SVG hoặc phản hồi HTML chặn tải -> đẩy sang Lớp 2 Auto Capture Stage
            return {'id': id, 'ok': false};
          }

          return {
            'id': id,
            'ok': true,
            'mimeType': mimeType,
            'data': base64Encode(bytes),
          };
        } catch (_) {
          return {'id': id, 'ok': false};
        }
      }),
    );

    return results;
  }

  static String _resolveMimeType(String headerMime, String urlStr) {
    if (headerMime.startsWith('image/')) return headerMime;
    final lower = urlStr.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    return headerMime;
  }
}
