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

  @override
  void dispose() {
    _retryNumController.dispose();
    super.dispose();
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
                          width: 42,
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
                      _buildStatusBanner(state),
                      const SizedBox(height: 12),
                      _buildPrimaryActions(context, state),
                      const SizedBox(height: 12),
                      _buildRetrySection(context),
                      const SizedBox(height: 12),
                      _buildModeSelector(state),
                      const SizedBox(height: 12),
                      _buildTogglesCard(state),
                      if (meta != null || state.lastAnswer.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        _buildResultCard(state),
                      ],
                      const SizedBox(height: 14),
                      _buildFooterTools(context),
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
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: AppTheme.withAlphaHex(AppTheme.skyAccent, 36),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.withAlphaHex(AppTheme.skyAccent, 100)),
          ),
          child: const Icon(Icons.auto_awesome, color: AppTheme.skyAccent, size: 20),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'OnLuyen Mod Mobile v1.0',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
              Text(
                state.hasKeys
                    ? '${state.activeKeyCount} API Key hoạt động • Multi-Agent 4 Tầng'
                    : 'Chưa có API Key • Hãy thêm Key để giải bài',
                style: TextStyle(
                  color: state.hasKeys ? AppTheme.textSecondary : AppTheme.amberWarn,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
        IconButton(
          tooltip: 'Tải lại trang',
          onPressed: () => widget.controller.reloadWebView(),
          icon: const Icon(Icons.refresh, color: AppTheme.textSecondary),
        ),
        IconButton(
          tooltip: 'Cài đặt API Key',
          onPressed: () {
            Navigator.of(context).pop();
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ApiKeySettingsScreen(controller: widget.controller),
              ),
            );
          },
          icon: const Icon(Icons.vpn_key_rounded, color: AppTheme.skyAccent),
        ),
      ],
    );
  }

  Widget _buildStatusBanner(SolverUiState state) {
    final isNoKey = !state.hasKeys;
    final bannerColor = isNoKey
        ? AppTheme.amberWarn
        : (state.pillState == PillVisualState.error
            ? AppTheme.crimsonErr
            : (state.pillState == PillVisualState.auditing
                ? AppTheme.violetAudit
                : AppTheme.skyAccent));

    return InkWell(
      onTap: isNoKey
          ? () {
              Navigator.of(context).pop();
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => ApiKeySettingsScreen(controller: widget.controller),
                ),
              );
            }
          : null,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: AppTheme.withAlphaHex(bannerColor, 26),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.withAlphaHex(bannerColor, 95)),
        ),
        child: Row(
          children: [
            Icon(
              isNoKey ? Icons.warning_amber_rounded : Icons.radar_rounded,
              color: bannerColor,
              size: 18,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                state.statusText,
                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 12.5, height: 1.35),
              ),
            ),
            if (isNoKey)
              const Icon(Icons.chevron_right, color: AppTheme.amberWarn, size: 18),
          ],
        ),
      ),
    );
  }

  Widget _buildPrimaryActions(BuildContext context, SolverUiState state) {
    return Row(
      children: [
        Expanded(
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: state.enabled ? AppTheme.emeraldSolved : AppTheme.bgCard,
              foregroundColor: state.enabled ? AppTheme.bgDeep : AppTheme.textPrimary,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => widget.controller.toggleEnabled(),
            icon: Icon(state.enabled ? Icons.power_settings_new : Icons.play_arrow_rounded, size: 19),
            label: Text(
              state.enabled ? 'Tự động: BẬT' : 'Tự động: TẮT',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.skyAccent,
              foregroundColor: AppTheme.bgDeep,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {
              Navigator.of(context).pop();
              widget.controller.forceScanNow();
            },
            icon: const Icon(Icons.search_rounded, size: 19),
            label: const Text(
              '🔍 Quét ngay',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRetrySection(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 96,
            child: TextField(
              controller: _retryNumController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13),
              decoration: const InputDecoration(
                isDense: true,
                hintText: 'Số câu...',
                contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 9),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.amberWarn,
                side: BorderSide(color: AppTheme.withAlphaHex(AppTheme.amberWarn, 140)),
                padding: const EdgeInsets.symmetric(vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () {
                final parsed = int.tryParse(_retryNumController.text.trim());
                Navigator.of(context).pop();
                widget.controller.retryQuestion(parsed);
              },
              icon: const Icon(Icons.refresh_rounded, size: 17),
              label: const Text(
                '🔄 Giải lại câu',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildModeSelector(SolverUiState state) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Chế độ suy luận Multi-Agent',
          style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        Row(
          children: IntelligenceMode.values.map((m) {
            final selected = state.mode == m;
            final desc = m == IntelligenceMode.fast
                ? 'Nhanh'
                : (m == IntelligenceMode.smart ? 'Cân bằng' : 'Tối đa 3-Agent');
            return Expanded(
              child: Padding(
                padding: EdgeInsets.only(right: m == IntelligenceMode.ultra ? 0 : 8),
                child: InkWell(
                  onTap: () => widget.controller.setIntelligenceMode(m),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 6),
                    decoration: BoxDecoration(
                      color: selected
                          ? AppTheme.withAlphaHex(AppTheme.skyAccent, 38)
                          : AppTheme.bgCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: selected ? AppTheme.skyAccent : AppTheme.borderSubtle,
                        width: selected ? 1.4 : 1,
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(
                          m.displayName,
                          style: TextStyle(
                            color: selected ? AppTheme.skyAccent : AppTheme.textPrimary,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          desc,
                          style: const TextStyle(color: AppTheme.textSecondary, fontSize: 10.5),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildTogglesCard(SolverUiState state) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: Column(
        children: [
          SwitchListTile(
            dense: true,
            title: const Text(
              'Tự sang câu tiếp theo',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 13.5, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Tự bấm Tiếp tục / bỏ qua màn hình giải thích',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 11.5),
            ),
            value: state.autoAdvance,
            activeThumbColor: AppTheme.skyAccent,
            onChanged: (v) => widget.controller.toggleAutoAdvance(v),
          ),
          const Divider(height: 1, color: AppTheme.borderSubtle),
          SwitchListTile(
            dense: true,
            title: const Text(
              'Desktop Mode (WebView)',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 13.5, fontWeight: FontWeight.w600),
            ),
            subtitle: const Text(
              'Chuyển User-Agent sang Desktop nếu cần bố cục máy tính',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 11.5),
            ),
            value: state.desktopMode,
            activeThumbColor: AppTheme.violetAudit,
            onChanged: (v) => widget.controller.toggleDesktopMode(v),
          ),
        ],
      ),
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
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.withAlphaHex(badgeColor, 110)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (meta != null && meta.subject.isNotEmpty)
                _chip(meta.subject, AppTheme.skyAccent),
              if (meta != null)
                _chip('${meta.confidence}% tin cậy', AppTheme.emeraldSolved),
              _chip(pipelineBadge, badgeColor),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            state.lastAnswer.isNotEmpty
                ? state.lastAnswer
                : '${meta?.qLabel ?? ''}: ${meta?.normalizedAns ?? ''}',
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 14.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          if (meta != null && meta.step.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              meta.step,
              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12.5, height: 1.4),
            ),
          ],
          if (meta != null && meta.auditNote.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppTheme.withAlphaHex(AppTheme.violetAudit, 24),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.withAlphaHex(AppTheme.violetAudit, 80)),
              ),
              child: Text(
                'Phản biện: ${meta.auditNote}',
                style: const TextStyle(color: Color(0xFFDDD6FE), fontSize: 12, height: 1.35),
              ),
            ),
          ],
          if (meta != null && meta.modelUsed.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'Model: ${meta.modelUsed}',
              style: const TextStyle(color: AppTheme.slateMuted, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }

  Widget _chip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppTheme.withAlphaHex(color, 34),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.withAlphaHex(color, 110)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }

  Widget _buildFooterTools(BuildContext context) {
    final count = widget.controller.history.length;
    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppTheme.textPrimary,
              side: const BorderSide(color: AppTheme.borderSubtle),
              padding: const EdgeInsets.symmetric(vertical: 11),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => HistoryScreen(controller: widget.controller),
                ),
              );
            },
            icon: const Icon(Icons.history_rounded, size: 18),
            label: Text('Lịch sử ($count)', style: const TextStyle(fontSize: 12.5)),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppTheme.emeraldSolved,
              side: BorderSide(color: AppTheme.withAlphaHex(AppTheme.emeraldSolved, 130)),
              padding: const EdgeInsets.symmetric(vertical: 11),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: count == 0 ? null : () => _showExportPicker(context),
            icon: const Icon(Icons.ios_share_rounded, size: 18),
            label: const Text('Xuất .txt', style: TextStyle(fontSize: 12.5)),
          ),
        ),
      ],
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
