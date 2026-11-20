import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../controllers/solver_controller.dart';
import '../../models/solver_models.dart';
import '../theme/app_theme.dart';

class FloatingSolverPill extends StatefulWidget {
  final SolverController controller;
  final VoidCallback onTap;
  final bool visible;

  const FloatingSolverPill({
    super.key,
    required this.controller,
    required this.onTap,
    this.visible = true,
  });

  @override
  State<FloatingSolverPill> createState() => _FloatingSolverPillState();
}

class _FloatingSolverPillState extends State<FloatingSolverPill> {
  double? _top;
  bool _dockRight = true;
  bool _isDragging = false;
  double _dragLeft = 0;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final padding = MediaQuery.paddingOf(context);
    final uiState = widget.controller.state;

    final isModActive = uiState.enabled;
    final ansChip = _shortAnsChip(uiState.lastMeta?.normalizedAns ?? '');
    final showCompactAnsChip = isModActive && uiState.pillState == PillVisualState.solved && ansChip.isNotEmpty;

    final double widgetWidth;
    final double widgetHeight;
    if (!isModActive && uiState.stealthMode) {
      widgetWidth = 44;
      widgetHeight = 44;
    } else if (showCompactAnsChip) {
      widgetWidth = 96;
      widgetHeight = 34;
    } else {
      widgetWidth = isModActive ? 36 : 34;
      widgetHeight = isModActive ? 36 : 34;
    }

    const edgeMargin = 14.0;
    final minTop = padding.top + 8;
    final maxTop = (size.height - padding.bottom - widgetHeight - 16).clamp(minTop, size.height);
    final defaultBottomTop = (size.height - padding.bottom - widgetHeight - 24).clamp(minTop, maxTop);
    final clampedTop = (_top ?? defaultBottomTop).clamp(minTop, maxTop);

    final targetLeft = _isDragging
        ? _dragLeft.clamp(edgeMargin, size.width - widgetWidth - edgeMargin)
        : (_dockRight ? size.width - widgetWidth - edgeMargin : edgeMargin);

    return AnimatedPositioned(
      duration: _isDragging ? Duration.zero : const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
      left: targetLeft,
      top: clampedTop,
      child: Offstage(
        offstage: !widget.visible,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: (!isModActive && uiState.stealthMode) ? null : widget.onTap,
          onDoubleTap: (!isModActive && uiState.stealthMode) ? widget.onTap : null,
          onLongPress: () {
            HapticFeedback.mediumImpact();
            if (isModActive) {
              widget.controller.hideAndDisableMod();
            } else {
              widget.onTap();
            }
          },
          onPanStart: (_) {
            setState(() {
              _isDragging = true;
              _top ??= defaultBottomTop;
              _dragLeft = _dockRight ? size.width - widgetWidth - edgeMargin : edgeMargin;
            });
          },
          onPanUpdate: (details) {
            setState(() {
              _top = ((_top ?? defaultBottomTop) + details.delta.dy).clamp(minTop, maxTop);
              _dragLeft = (_dragLeft + details.delta.dx).clamp(edgeMargin, size.width - widgetWidth - edgeMargin);
            });
          },
          onPanEnd: (_) {
            final centerX = _dragLeft + widgetWidth / 2;
            setState(() {
              _isDragging = false;
              _dockRight = centerX >= size.width / 2;
            });
          },
          child: _buildTriggerVisual(uiState, widgetWidth, widgetHeight, showCompactAnsChip, ansChip),
        ),
      ),
    );
  }

  Widget _buildTriggerVisual(
    SolverUiState uiState,
    double width,
    double height,
    bool showCompactAnsChip,
    String ansChip,
  ) {
    // 1. Tàng hình tối đa khi Mod tắt: chấm cực nhỏ mờ góc dưới phải
    if (!uiState.enabled && uiState.stealthMode) {
      return SizedBox(
        width: width,
        height: height,
        child: Align(
          alignment: Alignment.bottomRight,
          child: Container(
            width: 8,
            height: 8,
            margin: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: AppTheme.withAlphaHex(AppTheme.slateMuted, 45),
              shape: BoxShape.circle,
            ),
          ),
        ),
      );
    }

    // 2. Mặc định (Mod tắt): Nút tròn nhỏ gọn translucent, không BackdropFilter, không chữ
    if (!uiState.enabled) {
      return Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: AppTheme.withAlphaHex(AppTheme.bgSurface, 130),
          shape: BoxShape.circle,
          border: Border.all(
            color: AppTheme.withAlphaHex(AppTheme.textSecondary, 90),
            width: 1,
          ),
        ),
        child: Icon(
          Icons.tune_rounded,
          size: 16,
          color: AppTheme.withAlphaHex(AppTheme.textPrimary, 215),
        ),
      );
    }

    // 3. Mod đang bật: Chỉ báo tối giản góc màn hình
    final appearance = _resolveActiveAppearance(uiState);
    if (showCompactAnsChip) {
      return Container(
        width: width,
        height: height,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: AppTheme.withAlphaHex(AppTheme.bgDeep, 224),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: AppTheme.withAlphaHex(appearance.accent, 185),
            width: 1.2,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: appearance.accent,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                ansChip,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: appearance.accent,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: AppTheme.withAlphaHex(AppTheme.bgDeep, 224),
        shape: BoxShape.circle,
        border: Border.all(
          color: AppTheme.withAlphaHex(appearance.accent, 190),
          width: 1.3,
        ),
      ),
      child: Center(
        child: appearance.isBusy
            ? SizedBox(
                width: 15,
                height: 15,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(appearance.accent),
                ),
              )
            : Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: appearance.accent,
                  shape: BoxShape.circle,
                ),
              ),
      ),
    );
  }

  _PillAppearance _resolveActiveAppearance(SolverUiState state) {
    switch (state.pillState) {
      case PillVisualState.noKey:
        return const _PillAppearance(accent: AppTheme.amberWarn);
      case PillVisualState.paused:
        return const _PillAppearance(accent: AppTheme.slateMuted);
      case PillVisualState.idle:
        return const _PillAppearance(accent: AppTheme.skyAccent);
      case PillVisualState.scanning:
        return const _PillAppearance(accent: AppTheme.skyAccent, isBusy: true);
      case PillVisualState.auditing:
        return const _PillAppearance(accent: AppTheme.violetAudit, isBusy: true);
      case PillVisualState.tieBreaking:
        return const _PillAppearance(accent: AppTheme.amberWarn, isBusy: true);
      case PillVisualState.solved:
        return const _PillAppearance(accent: AppTheme.emeraldSolved);
      case PillVisualState.error:
        return const _PillAppearance(accent: AppTheme.crimsonErr);
    }
  }

  String _shortAnsChip(String norm) {
    final t = norm.trim();
    if (t.isEmpty) return '';
    return t.length > 7 ? '${t.substring(0, 6)}…' : t;
  }
}

class _PillAppearance {
  final Color accent;
  final bool isBusy;

  const _PillAppearance({
    required this.accent,
    this.isBusy = false,
  });
}
