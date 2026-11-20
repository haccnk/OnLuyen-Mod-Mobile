import 'dart:async';
import 'dart:convert';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../models/api_key_entry.dart';
import '../models/quiz_history_item.dart';
import '../models/solver_models.dart';
import '../services/export_service.dart';
import '../services/gemini_client.dart';
import '../services/key_pool_service.dart';
import '../services/media_fetcher_service.dart';
import '../services/multi_agent_solver.dart';
import '../services/storage_service.dart';

class SolverController extends ChangeNotifier {
  static const String targetUrl = 'https://app.onluyen.vn';

  static const String mobileAndroidUa =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  static const String mobileIosUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
  static const String desktopUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  final StorageService storage;
  final KeyPoolService keyPool;
  final GeminiClient geminiClient;
  final MultiAgentSolver multiAgentSolver;
  final MediaFetcherService mediaFetcher;
  final ExportService exportService;

  InAppWebViewController? _webViewController;
  SolverUiState _state = const SolverUiState();
  List<ApiKeyEntry> _apiKeys = [];
  List<QuizHistoryItem> _history = [];
  bool _isPillVisibleForCapture = true;
  bool _isTestingKeys = false;
  double _pageProgress = 0.0;
  String _currentUrl = targetUrl;
  String? _completionBannerMessage;

  SolverController({
    required this.storage,
    KeyPoolService? keyPool,
    GeminiClient? geminiClient,
    MediaFetcherService? mediaFetcher,
    ExportService? exportService,
  })  : keyPool = keyPool ?? KeyPoolService(storage: storage),
        geminiClient = geminiClient ?? GeminiClient(),
        mediaFetcher = mediaFetcher ?? MediaFetcherService(),
        exportService = exportService ?? ExportService(),
        multiAgentSolver = MultiAgentSolver(
          keyPool: keyPool ?? KeyPoolService(storage: storage),
          client: geminiClient ?? GeminiClient(),
        );

  SolverUiState get state => _state;
  List<ApiKeyEntry> get apiKeys => List.unmodifiable(_apiKeys);
  List<QuizHistoryItem> get history => List.unmodifiable(_history);
  bool get isPillVisibleForCapture => _isPillVisibleForCapture;
  bool get isTestingKeys => _isTestingKeys;
  double get pageProgress => _pageProgress;
  String get currentUrl => _currentUrl;
  String? get completionBannerMessage => _completionBannerMessage;

  String get activeUserAgent {
    if (_state.desktopMode) return desktopUa;
    return defaultTargetPlatform == TargetPlatform.iOS ? mobileIosUa : mobileAndroidUa;
  }

  List<String> get enabledKeyStrings =>
      _apiKeys.where((k) => k.enabled && k.key.trim().isNotEmpty).map((k) => k.key.trim()).toList();

  Future<void> init() async {
    await storage.init();
    await keyPool.loadPersistedCooldowns();
    _apiKeys = await storage.loadApiKeys();
    _history = await storage.loadHistory();

    final enabled = await storage.loadEnabled();
    final autoAdvance = await storage.loadAutoAdvance();
    final desktopMode = await storage.loadDesktopMode();
    final mode = await storage.loadIntelligenceMode();

    final activeCount = enabledKeyStrings.length;
    final hasAnyKeys = activeCount > 0;

    _state = _state.copyWith(
      enabled: enabled,
      autoAdvance: autoAdvance,
      desktopMode: desktopMode,
      mode: mode,
      activeKeyCount: activeCount,
      hasKeys: hasAnyKeys,
      pillState: !hasAnyKeys
          ? PillVisualState.noKey
          : (enabled ? PillVisualState.idle : PillVisualState.paused),
      statusText: !hasAnyKeys
          ? 'Chưa có API Key — chạm để thêm Key'
          : (enabled ? 'Sẵn sàng quét trên OnLuyen' : 'Đang tạm tắt tự động giải'),
    );
    notifyListeners();
  }

  InAppWebViewSettings buildWebViewSettings() {
    return InAppWebViewSettings(
      userAgent: activeUserAgent,
      javaScriptEnabled: true,
      domStorageEnabled: true,
      databaseEnabled: true,
      thirdPartyCookiesEnabled: true,
      sharedCookiesEnabled: true,
      javaScriptCanOpenWindowsAutomatically: true,
      supportMultipleWindows: true,
      useHybridComposition: true,
      allowsInlineMediaPlayback: true,
      mediaPlaybackRequiresUserGesture: false,
      preferredContentMode:
          _state.desktopMode ? UserPreferredContentMode.DESKTOP : UserPreferredContentMode.MOBILE,
      mixedContentMode: MixedContentMode.MIXED_CONTENT_COMPATIBILITY_MODE,
      safeBrowsingEnabled: false,
    );
  }

  void attachWebViewController(InAppWebViewController controller) {
    _webViewController = controller;

    controller.addJavaScriptHandler(
      handlerName: 'getConfig',
      callback: (_) => _buildJsConfigPayload(),
    );

    controller.addJavaScriptHandler(
      handlerName: 'syncStatus',
      callback: (args) {
        if (args.isNotEmpty && args.first is Map) {
          _handleJsSyncStatus(Map<String, dynamic>.from(args.first as Map));
        }
        return {'ok': true};
      },
    );

    controller.addJavaScriptHandler(
      handlerName: 'fetchImagesWithCookies',
      callback: (args) async {
        if (args.isEmpty || args.first is! Map) return const [];
        final data = Map<String, dynamic>.from(args.first as Map);
        final pageUrl = (data['pageUrl'] ?? _currentUrl).toString();
        final rawItems = data['items'];
        final items = rawItems is List
            ? rawItems.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList()
            : <Map<String, dynamic>>[];
        return mediaFetcher.fetchImagesWithCookies(
          pageUrl: pageUrl,
          items: items,
          userAgent: activeUserAgent,
        );
      },
    );

    controller.addJavaScriptHandler(
      handlerName: 'setFloatingPillVisible',
      callback: (args) async {
        var visible = true;
        if (args.isNotEmpty && args.first is Map) {
          visible = (args.first as Map)['visible'] != false;
        }
        _isPillVisibleForCapture = visible;
        notifyListeners();
        await Future<void>.delayed(const Duration(milliseconds: 50));
        return {'visible': _isPillVisibleForCapture};
      },
    );

    controller.addJavaScriptHandler(
      handlerName: 'takeScreenshot',
      callback: (args) async {
        var quality = 92;
        if (args.isNotEmpty && args.first is Map) {
          final q = (args.first as Map)['quality'];
          if (q is num) quality = q.toInt().clamp(40, 100);
        }
        try {
          final bytes = await _webViewController?.takeScreenshot(
            screenshotConfiguration: ScreenshotConfiguration(
              compressFormat: CompressFormat.JPEG,
              quality: quality,
            ),
          );
          if (bytes == null || bytes.isEmpty) return null;
          return {
            'mimeType': 'image/jpeg',
            'data': base64Encode(bytes),
          };
        } catch (e) {
          return null;
        }
      },
    );

    controller.addJavaScriptHandler(
      handlerName: 'solveQuiz',
      callback: (args) async {
        if (args.isEmpty || args.first is! Map) {
          return {'success': false, 'error': 'Payload giải bài không hợp lệ'};
        }
        return _handleSolveQuiz(Map<String, dynamic>.from(args.first as Map));
      },
    );

    controller.addJavaScriptHandler(
      handlerName: 'saveHistoryItem',
      callback: (args) async {
        if (args.isNotEmpty && args.first is Map) {
          await _upsertHistoryItem(Map<String, dynamic>.from(args.first as Map));
        }
        return {'ok': true};
      },
    );

    controller.addJavaScriptHandler(
      handlerName: 'onQuizCompleted',
      callback: (_) {
        _completionBannerMessage =
            'Đã hoàn thành bài làm (${_history.length} câu đã lưu). Mở bảng điều khiển để xuất file .txt!';
        notifyListeners();
        return {'ok': true};
      },
    );
  }

  void clearCompletionBanner() {
    _completionBannerMessage = null;
    notifyListeners();
  }

  void updateNavigationProgress(double progress, String? url) {
    _pageProgress = progress;
    if (url != null && url.isNotEmpty) {
      _currentUrl = url;
    }
    notifyListeners();
  }

  Future<bool> handleSystemBack() async {
    final ctrl = _webViewController;
    if (ctrl != null && await ctrl.canGoBack()) {
      await ctrl.goBack();
      return false;
    }
    return true;
  }

  Future<void> reloadWebView() async {
    await _webViewController?.reload();
  }

  Future<void> navigateHome() async {
    await _webViewController?.loadUrl(urlRequest: URLRequest(url: WebUri(targetUrl)));
  }

  Map<String, dynamic> _buildJsConfigPayload() => {
        'autoSolverEnabled': _state.enabled,
        'autoAdvanceEnabled': _state.autoAdvance,
        'intelligenceMode': _state.mode.apiName,
      };

  Future<void> _pushConfigToWebView() async {
    final ctrl = _webViewController;
    if (ctrl == null) return;
    final jsonCfg = jsonEncode(_buildJsConfigPayload());
    try {
      await ctrl.evaluateJavascript(
        source: 'window.__OnLuyenMobileAgent && window.__OnLuyenMobileAgent.updateConfig($jsonCfg);',
      );
    } catch (_) {}
  }

  void _handleJsSyncStatus(Map<String, dynamic> data) {
    final statusTxt = (data['solverStatus'] ?? '').toString();
    final lastAns = data['lastSolvedAnswer']?.toString();
    final rawMeta = data['lastSolvedMeta'];
    final meta = rawMeta is Map ? SolverMeta.fromJson(Map<String, dynamic>.from(rawMeta)) : null;

    var nextPill = _state.pillState;
    if (!_state.hasKeys) {
      nextPill = PillVisualState.noKey;
    } else if (!_state.enabled) {
      nextPill = PillVisualState.paused;
    } else if (statusTxt.contains('⚠️') || statusTxt.contains('thất bại') || statusTxt.contains('Lỗi')) {
      nextPill = PillVisualState.error;
    } else if (statusTxt.contains('🧠') || statusTxt.contains('Đang giải') || statusTxt.contains('🔄')) {
      nextPill = PillVisualState.scanning;
    } else if (meta != null || statusTxt.startsWith('✅') || statusTxt.startsWith('Đã giải')) {
      nextPill = PillVisualState.solved;
    }

    _state = _state.copyWith(
      pillState: nextPill,
      statusText: statusTxt.isNotEmpty ? statusTxt : _state.statusText,
      lastAnswer: lastAns ?? _state.lastAnswer,
      lastMeta: meta ?? _state.lastMeta,
    );
    notifyListeners();
  }

  Future<Map<String, dynamic>> _handleSolveQuiz(Map<String, dynamic> rawMap) async {
    final keys = enabledKeyStrings;
    if (keys.isEmpty) {
      _state = _state.copyWith(
        hasKeys: false,
        activeKeyCount: 0,
        pillState: PillVisualState.noKey,
        statusText: 'Chưa có API Key — vui lòng vào Cài đặt thêm Key!',
      );
      notifyListeners();
      return {'success': false, 'error': 'Chưa cấu hình API Key nào!'};
    }

    final req = QuizSolveRequest.fromJson(rawMap);
    try {
      final result = await multiAgentSolver.solve(
        req,
        keys,
        onStage: (stage, message) {
          _state = _state.copyWith(
            pillState: stage,
            statusText: message,
          );
          notifyListeners();
        },
      );

      final meta = SolverMeta(
        qLabel: req.qCode,
        subject: result.subject,
        confidence: result.confidence,
        riskScore: result.riskScore,
        verifiedTwoPass: result.verifiedTwoPass,
        verifiedThreeAgent: result.verifiedThreeAgent,
        pipelineLabel: result.pipelineLabel,
        step: result.step,
        selfCheck: result.selfCheck,
        auditNote: result.auditNote,
        modelUsed: result.modelUsed,
        normalizedAns: result.normalizedAns,
      );

      _state = _state.copyWith(
        pillState: PillVisualState.solved,
        statusText: '${req.qCode}: ${result.normalizedAns} (${result.confidence}%)',
        lastAnswer: '${req.qCode}: ${result.normalizedAns}',
        lastMeta: meta,
      );
      notifyListeners();

      return {
        'success': true,
        'result': result.toJson(),
      };
    } catch (e) {
      final errMsg = e.toString().replaceFirst('Exception: ', '');
      _state = _state.copyWith(
        pillState: PillVisualState.error,
        statusText: '⚠️ Lỗi: $errMsg',
      );
      notifyListeners();
      return {
        'success': false,
        'error': errMsg,
      };
    }
  }

  Future<void> _upsertHistoryItem(Map<String, dynamic> raw) async {
    final item = QuizHistoryItem.fromJson({
      ...raw,
      'timestampMs': raw['timestampMs'] ?? DateTime.now().millisecondsSinceEpoch,
    });
    final list = List<QuizHistoryItem>.from(_history);
    final idx = list.indexWhere(
      (i) =>
          (item.signature.isNotEmpty && i.signature == item.signature) ||
          (item.qLabel.isNotEmpty && i.qLabel == item.qLabel),
    );
    if (idx == -1) {
      list.add(item);
    } else {
      list[idx] = item;
    }
    _history = list;
    await storage.saveHistory(list);
    notifyListeners();
  }

  Future<void> toggleEnabled([bool? forceValue]) async {
    final next = forceValue ?? !_state.enabled;
    await storage.saveEnabled(next);
    _state = _state.copyWith(
      enabled: next,
      pillState: !_state.hasKeys
          ? PillVisualState.noKey
          : (next ? PillVisualState.idle : PillVisualState.paused),
      statusText: !_state.hasKeys
          ? 'Chưa có API Key — chạm để thêm Key'
          : (next ? 'Đã bật tự động giải' : 'Đã tạm tắt tự động giải'),
    );
    notifyListeners();
    await _pushConfigToWebView();
  }

  Future<void> toggleAutoAdvance([bool? forceValue]) async {
    final next = forceValue ?? !_state.autoAdvance;
    await storage.saveAutoAdvance(next);
    _state = _state.copyWith(autoAdvance: next);
    notifyListeners();
    await _pushConfigToWebView();
  }

  Future<void> setIntelligenceMode(IntelligenceMode mode) async {
    await storage.saveIntelligenceMode(mode);
    _state = _state.copyWith(mode: mode);
    notifyListeners();
    await _pushConfigToWebView();
  }

  Future<void> toggleDesktopMode([bool? forceValue]) async {
    final next = forceValue ?? !_state.desktopMode;
    await storage.saveDesktopMode(next);
    _state = _state.copyWith(desktopMode: next);
    notifyListeners();
    final ctrl = _webViewController;
    if (ctrl != null) {
      await ctrl.setSettings(settings: buildWebViewSettings());
      await ctrl.reload();
    }
  }

  Future<void> forceScanNow() async {
    final ctrl = _webViewController;
    if (ctrl == null) return;
    if (!_state.hasKeys) {
      _state = _state.copyWith(
        pillState: PillVisualState.noKey,
        statusText: 'Chưa có API Key — hãy thêm Key trước khi quét!',
      );
      notifyListeners();
      return;
    }
    _state = _state.copyWith(
      pillState: PillVisualState.scanning,
      statusText: '🔍 Đang quét lại màn hình...',
    );
    notifyListeners();
    await ctrl.evaluateJavascript(
      source: 'window.__OnLuyenMobileAgent && window.__OnLuyenMobileAgent.forceScanNow();',
    );
  }

  Future<void> retryQuestion(int? targetQuestionNumber) async {
    final ctrl = _webViewController;
    if (ctrl == null) return;
    final arg = targetQuestionNumber == null ? 'null' : targetQuestionNumber.toString();
    _state = _state.copyWith(
      pillState: PillVisualState.scanning,
      statusText: targetQuestionNumber == null
          ? '🔄 Đang giải lại câu hiện tại...'
          : '🔄 Đang giải lại Câu $targetQuestionNumber...',
    );
    notifyListeners();
    await ctrl.evaluateJavascript(
      source: 'window.__OnLuyenMobileAgent && window.__OnLuyenMobileAgent.retryQuestion($arg);',
    );
  }

  Future<int> addApiKeys({required String rawKeysInput, String labelPrefix = ''}) async {
    final tokens = rawKeysInput
        .split(RegExp(r'[\r\n,;]+'))
        .map((k) => k.trim())
        .where((k) => k.isNotEmpty)
        .toList();
    if (tokens.isEmpty) return 0;

    final updated = List<ApiKeyEntry>.from(_apiKeys);
    var added = 0;
    for (final rawKey in tokens) {
      if (updated.any((e) => e.key == rawKey)) continue;
      added += 1;
      final indexNum = updated.length + 1;
      final lbl = labelPrefix.trim().isNotEmpty
          ? (tokens.length > 1 ? '${labelPrefix.trim()} #$added' : labelPrefix.trim())
          : 'Gemini Key #$indexNum';
      updated.add(
        ApiKeyEntry(
          id: '${DateTime.now().microsecondsSinceEpoch}_$indexNum',
          label: lbl,
          key: rawKey,
          enabled: true,
        ),
      );
    }

    if (added > 0) {
      await _commitApiKeys(updated);
    }
    return added;
  }

  Future<void> toggleApiKey(String id) async {
    final updated = _apiKeys
        .map((e) => e.id == id ? e.copyWith(enabled: !e.enabled) : e)
        .toList();
    await _commitApiKeys(updated);
  }

  Future<void> deleteApiKey(String id) async {
    final updated = _apiKeys.where((e) => e.id != id).toList();
    await _commitApiKeys(updated);
  }

  Future<void> _commitApiKeys(List<ApiKeyEntry> updated) async {
    _apiKeys = updated;
    await storage.saveApiKeys(updated);
    final activeCount = enabledKeyStrings.length;
    final hasAny = activeCount > 0;
    _state = _state.copyWith(
      activeKeyCount: activeCount,
      hasKeys: hasAny,
      pillState: !hasAny
          ? PillVisualState.noKey
          : (_state.enabled ? PillVisualState.idle : PillVisualState.paused),
      statusText: !hasAny
          ? 'Chưa có API Key — chạm để thêm Key'
          : 'Sẵn sàng ($activeCount Key đang bật)',
    );
    notifyListeners();
  }

  Future<void> clearCooldowns() async {
    await keyPool.clearAllCooldowns();
    multiAgentSolver.clearCache();
    notifyListeners();
  }

  Future<void> testSingleKeyLive(String id) async {
    final idx = _apiKeys.indexWhere((e) => e.id == id);
    if (idx == -1) return;
    _isTestingKeys = true;
    notifyListeners();
    try {
      final entry = _apiKeys[idx];
      final report = await geminiClient.testApiKeyLive(entry.key);
      final updated = List<ApiKeyEntry>.from(_apiKeys);
      updated[idx] = entry.copyWith(
        status: report.overallStatus,
        latencyMs: report.bestLatencyMs,
        clearLatency: report.bestLatencyMs == null,
        statusDetail: report.summary,
        modelStatuses: report.modelStatuses,
      );
      await _commitApiKeys(updated);
    } finally {
      _isTestingKeys = false;
      notifyListeners();
    }
  }

  Future<void> testAllKeysLive() async {
    if (_apiKeys.isEmpty || _isTestingKeys) return;
    _isTestingKeys = true;
    notifyListeners();
    try {
      final updated = List<ApiKeyEntry>.from(_apiKeys);
      await Future.wait(
        List.generate(updated.length, (i) async {
          final entry = updated[i];
          final report = await geminiClient.testApiKeyLive(entry.key);
          updated[i] = entry.copyWith(
            status: report.overallStatus,
            latencyMs: report.bestLatencyMs,
            clearLatency: report.bestLatencyMs == null,
            statusDetail: report.summary,
            modelStatuses: report.modelStatuses,
          );
        }),
      );
      await _commitApiKeys(updated);
    } finally {
      _isTestingKeys = false;
      notifyListeners();
    }
  }

  Future<void> clearHistory() async {
    _history = [];
    await storage.saveHistory([]);
    notifyListeners();
  }

  Future<void> exportAndShareHistory(
    ExportFormatMode mode, {
    Rect? shareOrigin,
  }) async {
    await exportService.exportAndShare(
      _history,
      mode: mode,
      shareOrigin: shareOrigin,
    );
  }
}
