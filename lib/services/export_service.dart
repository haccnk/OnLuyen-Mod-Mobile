import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../models/quiz_history_item.dart';

enum ExportFormatMode {
  answersOnly,
  detailedSolutions,
}

class ExportService {
  static String formatHistoryText(
    List<QuizHistoryItem> items, {
    required ExportFormatMode mode,
  }) {
    if (items.isEmpty) return '';

    final sections = <String>[];
    for (var i = 0; i < items.length; i++) {
      final item = items[i];
      final header = item.qLabel.isNotEmpty ? item.qLabel : 'Câu ${i + 1}';

      if (mode == ExportFormatMode.answersOnly) {
        sections.add('$header:\n${item.question}\nĐáp án: ${item.answer}');
      } else {
        final buf = StringBuffer();
        buf.writeln('$header (${item.subject.isNotEmpty ? item.subject : "Tổng hợp"} | ${item.confidence}%):');
        buf.writeln(item.question);
        buf.writeln('=> Đáp án: ${item.answer}');
        if (item.step.isNotEmpty) {
          buf.writeln('Lời giải: ${item.step}');
        }
        if (item.auditNote.isNotEmpty) {
          buf.writeln('Phản biện: ${item.auditNote}');
        }
        sections.add(buf.toString().trim());
      }
    }

    return sections.join('\n\n----------------------------------------\n\n');
  }

  Future<File> exportAndShare(
    List<QuizHistoryItem> items, {
    required ExportFormatMode mode,
    Rect? shareOrigin,
  }) async {
    final content = formatHistoryText(items, mode: mode);
    if (content.isEmpty) {
      throw Exception('Chưa có câu hỏi nào trong lịch sử để xuất.');
    }

    final dir = await getTemporaryDirectory();
    final suffix = mode == ExportFormatMode.answersOnly ? 'DapAn' : 'LoiGiai';
    final fileName = 'OnLuyen_Mod_${suffix}_${DateTime.now().millisecondsSinceEpoch}.txt';
    final file = File('${dir.path}/$fileName');
    await file.writeAsString(content, flush: true);

    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path)],
        subject: 'Kết quả OnLuyen Mod ($suffix)',
        text: 'Xuất ${items.length} câu hỏi từ OnLuyen Mod Mobile',
        sharePositionOrigin: shareOrigin,
      ),
    );

    return file;
  }
}
