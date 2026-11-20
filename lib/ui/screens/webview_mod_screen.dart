import 'dart:collection';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../../controllers/solver_controller.dart';
import '../theme/app_theme.dart';
import '../widgets/control_bottom_sheet.dart';
import '../widgets/floating_solver_pill.dart';

class WebViewModScreen extends StatefulWidget {
  final SolverController controller;

  const WebViewModScreen({super.key, required this.controller});

  @override
  State<WebViewModScreen> createState() => _WebViewModScreenState();
}

class _WebViewModScreenState extends State<WebViewModScreen> {
  UnmodifiableListView<UserScript>? _userScripts;
  bool _scriptsLoaded = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onControllerChanged);
    _loadAssetScripts();
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    final msg = widget.controller.completionBannerMessage;
    if (msg != null && mounted) {
      widget.controller.clearCompletionBanner();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          duration: const Duration(seconds: 5),
          action: SnackBarAction(
            label: 'Mở bảng',
            textColor: AppTheme.skyAccent,
            onPressed: _openControlSheet,
          ),
        ),
      );
    }
  }

  Future<void> _loadAssetScripts() async {
    final injectJs = await rootBundle.loadString('assets/js/inject.js');
    final extractorJs = await rootBundle.loadString('assets/js/dom_extractor_mobile.js');
    final agentJs = await rootBundle.loadString('assets/js/mobile_agent.js');

    if (!mounted) return;
    setState(() {
      _userScripts = UnmodifiableListView<UserScript>([
        UserScript(
          groupName: 'onluyen_mod_start',
          source: injectJs,
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
        ),
        UserScript(
          groupName: 'onluyen_mod_extractor',
          source: extractorJs,
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
        ),
        UserScript(
          groupName: 'onluyen_mod_agent',
          source: agentJs,
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_END,
        ),
      ]);
      _scriptsLoaded = true;
    });
  }

  void _openControlSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ControlBottomSheet(controller: widget.controller),
    );
  }

  Future<bool> _handleOAuthPopup(
    InAppWebViewController controller,
    CreateWindowAction createWindowAction,
  ) async {
    if (!mounted) return false;
    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (dialogCtx) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 28),
        backgroundColor: AppTheme.bgSurface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: SizedBox(
            width: double.maxFinite,
            height: MediaQuery.sizeOf(context).height * 0.78,
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  color: AppTheme.bgCard,
                  child: Row(
                    children: [
                      const Icon(Icons.lock_outline_rounded, size: 16, color: AppTheme.emeraldSolved),
                      const SizedBox(width: 8),
                      const Expanded(
                        child: Text(
                          'Đăng nhập tài khoản',
                          style: TextStyle(color: AppTheme.textPrimary, fontSize: 13.5, fontWeight: FontWeight.w700),
                        ),
                      ),
                      IconButton(
                        visualDensity: VisualDensity.compact,
                        onPressed: () => Navigator.of(dialogCtx).pop(),
                        icon: const Icon(Icons.close, color: AppTheme.textSecondary),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: InAppWebView(
                    windowId: createWindowAction.windowId,
                    initialSettings: InAppWebViewSettings(
                      userAgent: widget.controller.activeUserAgent,
                      javaScriptEnabled: true,
                      domStorageEnabled: true,
                      thirdPartyCookiesEnabled: true,
                      sharedCookiesEnabled: true,
                      javaScriptCanOpenWindowsAutomatically: true,
                    ),
                    onCloseWindow: (_) {
                      if (Navigator.of(dialogCtx).canPop()) {
                        Navigator.of(dialogCtx).pop();
                      }
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        final shouldPop = await widget.controller.handleSystemBack();
        if (shouldPop && mounted && navigator.canPop()) {
          navigator.pop();
        }
      },
      child: Scaffold(
        backgroundColor: AppTheme.bgDeep,
        body: SafeArea(
          child: ListenableBuilder(
            listenable: widget.controller,
            builder: (context, _) {
              final progress = widget.controller.pageProgress;
              final showPill = widget.controller.isPillVisibleForCapture;

              return Stack(
                children: [
                  if (!_scriptsLoaded)
                    const Center(
                      child: CircularProgressIndicator(color: AppTheme.skyAccent),
                    )
                  else
                    InAppWebView(
                      initialUrlRequest: URLRequest(
                        url: WebUri(SolverController.targetUrl),
                      ),
                      initialSettings: widget.controller.buildWebViewSettings(),
                      initialUserScripts: _userScripts,
                      onWebViewCreated: (ctrl) {
                        widget.controller.attachWebViewController(ctrl);
                      },
                      onCreateWindow: _handleOAuthPopup,
                      onLoadStart: (_, url) {
                        widget.controller.updateNavigationProgress(0.1, url?.toString());
                      },
                      onProgressChanged: (_, p) {
                        widget.controller.updateNavigationProgress(p / 100.0, null);
                      },
                      onLoadStop: (_, url) {
                        widget.controller.updateNavigationProgress(1.0, url?.toString());
                      },
                    ),
                  if (progress > 0.0 && progress < 1.0)
                    Positioned(
                      top: 0,
                      left: 0,
                      right: 0,
                      child: LinearProgressIndicator(
                        value: progress,
                        minHeight: 2.5,
                        backgroundColor: Colors.transparent,
                        valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.skyAccent),
                      ),
                    ),
                  Offstage(
                    offstage: !showPill,
                    child: FloatingSolverPill(
                      controller: widget.controller,
                      onTap: _openControlSheet,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
