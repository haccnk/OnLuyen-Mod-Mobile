import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../controllers/solver_controller.dart';
import '../../models/solver_models.dart';
import '../theme/app_theme.dart';

class FloatingSolverPill extends StatefulWidget {
  final SolverController controller;
  final VoidCallback onTap;

  const FloatingSolverPill({
    super.key,
    required this.controller,
    required this.onTap,
  });

  @override
  State<FloatingSolverPill> createState() => _FloatingSolverPillState();
}

class _FloatingSolverPillState extends State<FloatingSolverPill> {
  double _top = 140;
  bool _dockRight = true;
  bool _isDragging = false;
  double _dragLeft = 0;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final padding = MediaQuery.paddingOf(context);
    const pillWidth = 142.0;
    const pillHeight = 46.0;
    const edgeMargin = 10.0;

    final minTop = padding.top + 8;
    final maxTop = (size.height - padding.bottom - pillHeight - 16).clamp(minTop, size.height);
    final clampedTop = _top.clamp(minTop, maxTop);
    final targetLeft = _isDragging
        ? _dragLeft.clamp(edgeMargin, size.width - pillWidth - edgeMargin)
        : (_dockRight ? size.width - pillWidth - edgeMargin : edgeMargin);

    final uiState = widget.controller.state;
    final appearance = _resolveAppearance(uiState);

    return AnimatedPositioned(
      duration: _isDragging ? Duration.zero : const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
      left: targetLeft,
      top: clampedTop,
      child: GestureDetector(
        onTap: widget.onTap,
        onLongPress: () {
          HapticFeedback.mediumImpact();
          widget.controller.toggleEnabled();
        },
        onPanStart: (_) {
          setState(() {
            _isDragging = true;
            _dragLeft = _dockRight ? size.width - pillWidth - edgeMargin : edgeMargin;
          });
        },
        onPanUpdate: (details) {
          setState(() {
            _top = (_top + details.delta.dy).clamp(minTop, maxTop);
            _dragLeft = (_dragLeft + details.delta.dx).clamp(edgeMargin, size.width - pillWidth - edgeMargin);
          });
        },
        onPanEnd: (_) {
          final centerX = _dragLeft + pillWidth / 2;
          setState(() {
            _isDragging = false;
            _dockRight = centerX >= size.width / 2;
          });
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: pillWidth,
              height: pillHeight,
              padding: const EdgeInsets.symmetric(horizontal: 11),
              decoration: BoxDecoration(
                color: AppTheme.withAlphaHex(AppTheme.bgDeep, 224),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: AppTheme.withAlphaHex(appearance.accent, 190),
                  width: 1.4,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.withAlphaHex(appearance.accent, 65),
                    blurRadius: 14,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildLeadingDot(appearance),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      appearance.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.1,
                      ),
                    ),
                  ),
                  if (appearance.chip != null) ...[
                    const SizedBox(width: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.withAlphaHex(appearance.accent, 52),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        appearance.chip!,
                        style: TextStyle(
                          color: appearance.accent,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLeadingDot(_PillAppearance appearance) {
    if (appearance.isBusy) {
      return SizedBox(
        width: 14,
        height: 14,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          valueColor: AlwaysStoppedAnimation<Color>(appearance.accent),
        ),
      );
    }
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: appearance.accent,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: AppTheme.withAlphaHex(appearance.accent, 140),
            blurRadius: 6,
          ),
        ],
      ),
    );
  }

  _PillAppearance _resolveAppearance(SolverUiState state) {
    final ansChip = _shortAnsChip(state.lastMeta?.normalizedAns ?? '');
    switch (state.pillState) {
      case PillVisualState.noKey:
        return const _PillAppearance(
          accent: AppTheme.amberWarn,
          label: 'Chưa có Key',
          chip: '!',
        );
      case PillVisualState.paused:
        return const _PillAppearance(
          accent: AppTheme.slateMuted,
          label: 'Đang tắt',
        );
      case PillVisualState.idle:
        return _PillAppearance(
          accent: AppTheme.skyAccent,
          label: 'OnLuyen Mod',
          chip: state.mode.displayName,
        );
      case PillVisualState.scanning:
        return const _PillAppearance(
          accent: AppTheme.skyAccent,
          label: 'Đang quét',
          isBusy: true,
        );
      case PillVisualState.auditing:
        return const _PillAppearance(
          accent: AppTheme.violetAudit,
          label: 'Agent 2',
          isBusy: true,
        );
      case PillVisualState.tieBreaking:
        return const _PillAppearance(
          accent: AppTheme.amberWarn,
          label: 'Trọng tài',
          isBusy: true,
        );
      case PillVisualState.solved:
        return _PillAppearance(
          accent: AppTheme.emeraldSolved,
          label: 'Đã chốt',
          chip: ansChip.isNotEmpty ? ansChip : 'OK',
        );
      case PillVisualState.error:
        return const _PillAppearance(
          accent: AppTheme.crimsonErr,
          label: 'Lỗi quét',
          chip: '!',
        );
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
  final String label;
  final String? chip;
  final bool isBusy;

  const _PillAppearance({
    required this.accent,
    required this.label,
    this.chip,
    this.isBusy = false,
  });
}
