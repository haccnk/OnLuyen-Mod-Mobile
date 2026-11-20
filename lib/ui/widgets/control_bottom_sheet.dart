import 'dart:ui';

import 'package:flutter/material.dart';

import '../../controllers/solver_controller.dart';
import '../../models/solver_models.dart';
import '../../services/export_service.dart';
import '../screens/api_key_settings_screen.dart';
import '../screens/history_screen.dart';
import '../theme/app_theme.dart';

class ControlBottomSheet extends StatefulWidget {
  final SolverController controller;

  const ControlBottomSheet({super.key, required this.controller});

  @override
  State<ControlBottomSheet> createState() => _ControlBottomSheetState();
}

class _ControlBottomSheetState extends State<ControlBottomSheet> {
  final TextEditingController _retryNumController = TextEditingController();
  bool _showRetryNumberInput = false;

  @override
  void dispose() {
    _retryNumController.dispose();
    super.dispose();
  }

  void _openKeySettings(BuildContext context) {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ApiKeySettingsScreen(controller: widget.controller),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final state = widget.controller.state;
        final meta = state.lastMeta;

        return ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
            child: Container(
              decoration: BoxDecoration(
                color: AppTheme.withAlphaHex(AppTheme.bgSurface, 244),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                border: const Border(top: BorderSide(color: AppTheme.borderSubtle)),
              ),
              child: SafeArea(
                top: false,
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    10,
                    16,
                    18 + MediaQuery.viewInsetsOf(context).bottom,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Center(
                        child: Container(
                          width: 40,
                          height: 4,
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: AppTheme.slateMuted,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ),
                      _buildHeaderRow(context, state),
                      const SizedBox(height: 12),
                      _buildPrimaryToggleCard(context, state),
                      const SizedBox(height: 12),
                      _buildQuickActionRow(context),
                      if (meta != null || state.lastAnswer.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        _buildResultCard(state),
                      ],
                      const SizedBox(height: 12),
                      _buildAdvancedSection(context, state),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeaderRow(BuildContext context, SolverUiState state) {
    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: AppTheme.withAlphaHex(AppTheme.skyAccent, 30),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppTheme.withAlphaHex(AppTheme.skyAccent, 85)),
          ),
          child: const Icon(Icons.tune_rounded, color: AppTheme.skyAccent, size: 18),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Menu hỗ trợ',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 15.5,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                state.hasKeys
                    ? '${state.activeKeyCount} API Key sẵn sàng • ${state.mode.displayName}'
                    : 'Chưa cấu hình API Key',
                style: TextStyle(
                  color: state.hasKeys ? AppTheme.textSecondary : AppTheme.amberWarn,
                  fontSize: 11.5,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Cài đặt API Key',
          onPressed: () => _openKeySettings(context),
          icon: const Icon(Icons.vpn_key_rounded, color: AppTheme.skyAccent, size: 20),
        ),
        IconButton(
          tooltip: 'Tải lại trang',
          onPressed: () => widget.controller.reloadWebView(),
          icon: const Icon(Icons.refresh_rounded, color: AppTheme.textSecondary, size: 20),
        ),
        IconButton(
          tooltip: 'Về app thường',
          onPressed: () async {
            Navigator.of(context).pop();
            await widget.controller.hideAndDisableMod();
          },
          icon: const Icon(Icons.visibility_off_rounded, color: AppTheme.textSecondary, size: 20),
        ),
      ],
    );
  }

  Widget _buildPrimaryToggleCard(BuildContext context, SolverUiState state) {
    final isError = state.pillState == PillVisualState.error || state.pillState == PillVisualState.noKey;
    final accent = state.enabled
        ? AppTheme.emeraldSolved
        : (isError ? AppTheme.amberWarn : AppTheme.slateMuted);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: state.enabled ? AppTheme.withAlphaHex(AppTheme.emeraldSolved, 120) : AppTheme.borderSubtle,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Tự động giải',
                  style: TextStyle(
                    color: AppTheme.textPrimary,
                    fontSize: 14.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              Switch(
                value: state.enabled,
                activeThumbColor: AppTheme.emeraldSolved,
                onChanged: (v) => widget.controller.toggleEnabled(v),
              ),
            ],
          ),
          Text(
            state.statusText,
            style: TextStyle(
              color: isError ? AppTheme.amberWarn : AppTheme.textSecondary,
              fontSize: 12,
              height: 1.35,
            ),
          ),
          if (!state.hasKeys) ...[
            const SizedBox(height: 6),
            InkWell(
              onTap: () => _openKeySettings(context),
              child: const Padding(
                padding: EdgeInsets.symmetric(vertical: 2),
                child: Text(
                  'Thêm API Key →',
                  style: TextStyle(
                    color: AppTheme.skyAccent,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildQuickActionRow(BuildContext context) {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.skyAccent,
                  foregroundColor: AppTheme.bgDeep,
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () {
                  Navigator.of(context).pop();
                  widget.controller.forceScanNow();
                },
                icon: const Icon(Icons.search_rounded, size: 18),
                label: const Text(
                  'Quét ngay',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.amberWarn,
                  side: BorderSide(color: AppTheme.withAlphaHex(AppTheme.amberWarn, 130)),
                  padding: const EdgeInsets.symmetric(vertical: 11),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () {
                  final parsed = _showRetryNumberInput
                      ? int.tryParse(_retryNumController.text.trim())
                      : null;
                  Navigator.of(context).pop();
                  widget.controller.retryQuestion(parsed);
                },
                icon: const Icon(Icons.refresh_rounded, size: 17),
                label: const Text(
                  'Giải lại',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
            ),
            const SizedBox(width: 6),
            InkWell(
              onTap: () => setState(() => _showRetryNumberInput = !_showRetryNumberInput),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                height: 42,
                width: 40,
                decoration: BoxDecoration(
                  color: _showRetryNumberInput
                      ? AppTheme.withAlphaHex(AppTheme.amberWarn, 36)
                      : AppTheme.bgCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: _showRetryNumberInput ? AppTheme.amberWarn : AppTheme.borderSubtle,
                  ),
                ),
                child: Icon(
                  Icons.tag_rounded,
                  size: 18,
                  color: _showRetryNumberInput ? AppTheme.amberWarn : AppTheme.textSecondary,
                ),
              ),
            ),
          ],
        ),
        if (_showRetryNumberInput) ...[
          const SizedBox(height: 8),
          TextField(
            controller: _retryNumController,
            keyboardType: TextInputType.number,
            style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13),
            decoration: const InputDecoration(
              isDense: true,
              hintText: 'Nhập số câu cần giải lại (để trống = câu hiện tại)...',
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildResultCard(SolverUiState state) {
    final meta = state.lastMeta;
    final pipelineBadge = meta?.pipelineLabel ?? 'Agent 1';
    final isThree = meta?.verifiedThreeAgent ?? false;
    final isTwo = meta?.verifiedTwoPass ?? false;
    final badgeColor = isThree
        ? AppTheme.amberWarn
        : (isTwo ? AppTheme.violetAudit : AppTheme.emeraldSolved);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.withAlphaHex(badgeColor, 100)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (meta != null && meta.subject.isNotEmpty) _chip(meta.subject, AppTheme.skyAccent),
              if (meta != null) _chip('${meta.confidence}%', AppTheme.emeraldSolved),
              _chip(pipelineBadge, badgeColor),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            state.lastAnswer.isNotEmpty
                ? state.lastAnswer
                : '${meta?.qLabel ?? ''}: ${meta?.normalizedAns ?? ''}',
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (meta != null && meta.step.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              meta.step,
              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.4),
            ),
          ],
          if (meta != null && meta.auditNote.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppTheme.withAlphaHex(AppTheme.violetAudit, 22),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.withAlphaHex(AppTheme.violetAudit, 75)),
              ),
              child: Text(
                'Phản biện: ${meta.auditNote}',
                style: const TextStyle(color: Color(0xFFDDD6FE), fontSize: 11.5, height: 1.35),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAdvancedSection(BuildContext context, SolverUiState state) {
    final count = widget.controller.history.length;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: ExpansionTile(
        initiallyExpanded: false,
        tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        shape: const Border(),
        collapsedShape: const Border(),
        title: const Text(
          'Tùy chọn nâng cao & Lịch sử',
          style: TextStyle(color: AppTheme.textPrimary, fontSize: 13.5, fontWeight: FontWeight.w700),
        ),
        subtitle: Text(
          'Chế độ ${state.mode.displayName} • $count câu đã lưu',
          style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11.5),
        ),
        children: [
          _buildModeSelector(state),
          const SizedBox(height: 8),
          SwitchListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Tự sang câu tiếp theo',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Tự bấm Tiếp tục / bỏ qua màn hình giải thích',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 11),
            ),
            value: state.autoAdvance,
            activeThumbColor: AppTheme.skyAccent,
            onChanged: (v) => widget.controller.toggleAutoAdvance(v),
          ),
          const Divider(height: 1, color: AppTheme.borderSubtle),
          SwitchListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Desktop Mode (WebView)',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Chuyển User-Agent sang giao diện máy tính',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 11),
            ),
            value: state.desktopMode,
            activeThumbColor: AppTheme.violetAudit,
            onChanged: (v) => widget.controller.toggleDesktopMode(v),
          ),
          const Divider(height: 1, color: AppTheme.borderSubtle),
          SwitchListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            title: const Text(
              'Tàng hình tối đa',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Ẩn mờ nút góc dưới phải khi tắt Mod (chạm đúp/nhấn giữ để mở)',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 11),
            ),
            value: state.stealthMode,
            activeThumbColor: AppTheme.emeraldSolved,
            onChanged: (v) => widget.controller.toggleStealthMode(v),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.textPrimary,
                    side: const BorderSide(color: AppTheme.borderSubtle),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: () {
                    Navigator.of(context).pop();
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => HistoryScreen(controller: widget.controller),
                      ),
                    );
                  },
                  icon: const Icon(Icons.history_rounded, size: 17),
                  label: Text('Lịch sử ($count)', style: const TextStyle(fontSize: 12)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.emeraldSolved,
                    side: BorderSide(color: AppTheme.withAlphaHex(AppTheme.emeraldSolved, 130)),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: count == 0 ? null : () => _showExportPicker(context),
                  icon: const Icon(Icons.ios_share_rounded, size: 17),
                  label: const Text('Xuất .txt', style: TextStyle(fontSize: 12)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildModeSelector(SolverUiState state) {
    return Row(
      children: IntelligenceMode.values.map((m) {
        final selected = state.mode == m;
        final desc = m == IntelligenceMode.fast
            ? 'Nhanh'
            : (m == IntelligenceMode.smart ? 'Cân bằng' : '3-Agent');
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: m == IntelligenceMode.ultra ? 0 : 6),
            child: InkWell(
              onTap: () => widget.controller.setIntelligenceMode(m),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                decoration: BoxDecoration(
                  color: selected
                      ? AppTheme.withAlphaHex(AppTheme.skyAccent, 36)
                      : AppTheme.bgDeep,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: selected ? AppTheme.skyAccent : AppTheme.borderSubtle,
                  ),
                ),
                child: Column(
                  children: [
                    Text(
                      m.displayName,
                      style: TextStyle(
                        color: selected ? AppTheme.skyAccent : AppTheme.textPrimary,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      desc,
                      style: const TextStyle(color: AppTheme.textSecondary, fontSize: 10),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppTheme.withAlphaHex(color, 32),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.withAlphaHex(color, 100)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }

  void _showExportPicker(BuildContext context) {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppTheme.bgSurface,
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.description_outlined, color: AppTheme.skyAccent),
              title: const Text('Xuất Đáp án gọn (.txt)'),
              subtitle: const Text('Chỉ gồm đề bài và đáp án cuối cùng'),
              onTap: () async {
                Navigator.of(sheetCtx).pop();
                await _runExport(ExportFormatMode.answersOnly, origin);
              },
            ),
            ListTile(
              leading: const Icon(Icons.menu_book_rounded, color: AppTheme.emeraldSolved),
              title: const Text('Xuất Lời giải chi tiết (.txt)'),
              subtitle: const Text('Đầy đủ môn học, % tin cậy, lời giải & phản biện'),
              onTap: () async {
                Navigator.of(sheetCtx).pop();
                await _runExport(ExportFormatMode.detailedSolutions, origin);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _runExport(ExportFormatMode mode, Rect? origin) async {
    try {
      await widget.controller.exportAndShareHistory(mode, shareOrigin: origin);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không thể xuất file: $e')),
      );
    }
  }
}
