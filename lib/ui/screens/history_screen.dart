import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../controllers/solver_controller.dart';
import '../../models/quiz_history_item.dart';
import '../../services/export_service.dart';
import '../theme/app_theme.dart';

class HistoryScreen extends StatefulWidget {
  final SolverController controller;

  const HistoryScreen({super.key, required this.controller});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  String _query = '';

  Future<void> _export(ExportFormatMode mode) async {
    final box = context.findRenderObject() as RenderBox?;
    final origin = box != null ? box.localToGlobal(Offset.zero) & box.size : null;
    try {
      await widget.controller.exportAndShareHistory(mode, shareOrigin: origin);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi xuất file: $e')),
      );
    }
  }

  Future<void> _confirmClear() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgCard,
        title: const Text('Xóa toàn bộ lịch sử?'),
        content: const Text('Thao tác này sẽ xóa các câu hỏi đã lưu trong bộ nhớ lịch sử.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppTheme.crimsonErr),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xóa'),
          ),
        ],
      ),
    );
    if (ok == true) {
      await widget.controller.clearHistory();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Lịch sử Giải & Xuất Đề', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          PopupMenuButton<ExportFormatMode>(
            tooltip: 'Xuất file .txt',
            icon: const Icon(Icons.ios_share_rounded, color: AppTheme.emeraldSolved),
            onSelected: _export,
            itemBuilder: (_) => const [
              PopupMenuItem(
                value: ExportFormatMode.answersOnly,
                child: Text('Xuất Đáp án gọn (.txt)'),
              ),
              PopupMenuItem(
                value: ExportFormatMode.detailedSolutions,
                child: Text('Xuất Lời giải chi tiết (.txt)'),
              ),
            ],
          ),
          IconButton(
            tooltip: 'Xóa lịch sử',
            onPressed: widget.controller.history.isEmpty ? null : _confirmClear,
            icon: const Icon(Icons.delete_sweep_outlined, color: AppTheme.crimsonErr),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: widget.controller,
        builder: (context, _) {
          final allItems = widget.controller.history.reversed.toList();
          final filtered = _query.trim().isEmpty
              ? allItems
              : allItems.where((item) {
                  final q = _query.toLowerCase();
                  return item.qLabel.toLowerCase().contains(q) ||
                      item.question.toLowerCase().contains(q) ||
                      item.answer.toLowerCase().contains(q) ||
                      item.subject.toLowerCase().contains(q);
                }).toList();

          return Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: TextField(
                  onChanged: (v) => setState(() => _query = v),
                  style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13.5),
                  decoration: const InputDecoration(
                    hintText: 'Tìm theo câu, môn học hoặc nội dung...',
                    prefixIcon: Icon(Icons.search, color: AppTheme.textSecondary),
                    isDense: true,
                  ),
                ),
              ),
              Expanded(
                child: filtered.isEmpty
                    ? const Center(
                        child: Text(
                          'Chưa có câu hỏi nào được lưu.',
                          style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                        itemCount: filtered.length,
                        itemBuilder: (_, idx) => _buildItemCard(filtered[idx]),
                      ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildItemCard(QuizHistoryItem item) {
    final badgeText = item.verifiedThreeAgent
        ? '3-Agent Trọng tài ✔'
        : (item.verifiedTwoPass ? 'Agent 1 -> Agent 2 ✔' : 'Agent 1');
    final badgeColor = item.verifiedThreeAgent
        ? AppTheme.amberWarn
        : (item.verifiedTwoPass ? AppTheme.violetAudit : AppTheme.skyAccent);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        title: Row(
          children: [
            Text(
              item.qLabel.isNotEmpty ? item.qLabel : 'Câu hỏi',
              style: const TextStyle(
                color: AppTheme.skyAccent,
                fontWeight: FontWeight.w800,
                fontSize: 13.5,
              ),
            ),
            const SizedBox(width: 8),
            if (item.subject.isNotEmpty)
              Expanded(
                child: Text(
                  '${item.subject} • ${item.confidence}%',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                ),
              ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            'Đáp án: ${item.answer}',
            style: const TextStyle(
              color: AppTheme.emeraldSolved,
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.withAlphaHex(badgeColor, 28),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    badgeText,
                    style: TextStyle(color: badgeColor, fontSize: 11, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  item.question,
                  style: const TextStyle(color: AppTheme.textPrimary, fontSize: 12.5, height: 1.4),
                ),
                if (item.step.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Lời giải: ${item.step}',
                    style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12, height: 1.4),
                  ),
                ],
                if (item.auditNote.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Phản biện: ${item.auditNote}',
                    style: const TextStyle(color: Color(0xFFDDD6FE), fontSize: 12, height: 1.35),
                  ),
                ],
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton.icon(
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: '${item.qLabel}: ${item.answer}'));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Đã sao chép đáp án!')),
                      );
                    },
                    icon: const Icon(Icons.copy_rounded, size: 15),
                    label: const Text('Sao chép đáp án', style: TextStyle(fontSize: 12)),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
