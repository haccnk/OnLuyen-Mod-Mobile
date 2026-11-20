class ConsistencyReport {
  final bool internalMismatch;
  final bool hasUncertainty;
  final String note;

  const ConsistencyReport({
    required this.internalMismatch,
    required this.hasUncertainty,
    this.note = '',
  });
}

class ConsistencyChecker {
  static final RegExp _uncertaintyCueRe = RegExp(
    r'(có thể là|chưa chắc|không chắc|nghi ngờ|phân vân|cần kiểm tra lại|khá mơ hồ|tạm chọn|ambiguous|uncertain|not sure)',
    caseSensitive: false,
  );

  static ConsistencyReport check({
    required String questionType,
    required String normalizedAns,
    required String step,
    String selfCheck = '',
    bool hasInternalConflict = false,
  }) {
    final combined = '$step\n$selfCheck'.trim();
    final hasUncertainty = _uncertaintyCueRe.hasMatch(combined);
    if (hasInternalConflict) {
      return ConsistencyReport(
        internalMismatch: true,
        hasUncertainty: hasUncertainty,
        note: 'Mâu thuẫn nội bộ giữa bảng đánh giá từng mệnh đề và danh sách Đúng/Sai.',
      );
    }

    if (normalizedAns.isEmpty || combined.isEmpty) {
      return ConsistencyReport(
        internalMismatch: false,
        hasUncertainty: hasUncertainty,
      );
    }

    final focusText = selfCheck.trim().isNotEmpty ? '$selfCheck\n${_tailSentence(step)}' : _tailSentence(step);

    if (questionType == 'MCQ') {
      final explicitPick = RegExp(
        r'(?:chọn|đáp án(?:\s+đúng)?|kết luận|kết quả|=>|->)\s*(?:là|:)?\s*\(?([A-D])\)?(?=[\.\s,;!\)]|$)',
        caseSensitive: false,
      );
      final matches = explicitPick.allMatches(focusText).toList();
      if (matches.isNotEmpty) {
        final mentioned = (matches.last.group(1) ?? '').toUpperCase();
        if (mentioned.isNotEmpty && mentioned != normalizedAns) {
          return ConsistencyReport(
            internalMismatch: true,
            hasUncertainty: hasUncertainty,
            note: 'Lời giải/selfCheck nhắc tới "$mentioned" nhưng đáp án chốt lại là "$normalizedAns".',
          );
        }
      }
    } else if (questionType == 'TRUE_FALSE' && normalizedAns.contains('-')) {
      final ansParts = normalizedAns.split('-');
      if (ansParts.length == 4) {
        for (var i = 0; i < 4; i++) {
          final letter = String.fromCharCode(97 + i); // a, b, c, d
          final expectedIsTrue = ansParts[i] == 'Đ';
          final stmtPattern = RegExp(
            '(?:ý|mệnh đề)?\\s*$letter\\s*[\\)\\:\\-]\\s*(Đúng|Sai|True|False)',
            caseSensitive: false,
          );
          final matches = stmtPattern.allMatches(combined).toList();
          if (matches.isNotEmpty) {
            final lastVerdict = (matches.last.group(1) ?? '').toLowerCase();
            final mentionedTrue = lastVerdict == 'đúng' || lastVerdict == 'true';
            if (mentionedTrue != expectedIsTrue) {
              return ConsistencyReport(
                internalMismatch: true,
                hasUncertainty: hasUncertainty,
                note: 'Mệnh đề $letter trong lời giải nêu "${mentionedTrue ? 'Đúng' : 'Sai'}" nhưng chốt "${expectedIsTrue ? 'Đ' : 'S'}".',
              );
            }
          }
        }
      }
    } else if (questionType == 'SHORT_ANSWER') {
      final shortPick = RegExp(
        r'(?:đáp án(?:\s+cuối)?|kết quả(?:\s+cuối)?|kết luận)\s*(?:là|:|=)\s*(-?\d+(?:[.,]\d+)?)',
        caseSensitive: false,
      );
      final matches = shortPick.allMatches(focusText).toList();
      if (matches.isNotEmpty) {
        final mentioned = (matches.last.group(1) ?? '').replaceAll('.', ',').trim();
        final normClean = normalizedAns.replaceAll('.', ',').trim();
        if (mentioned.isNotEmpty &&
            RegExp(r'^-?\d+(?:,\d+)?$').hasMatch(normClean) &&
            mentioned != normClean) {
          return ConsistencyReport(
            internalMismatch: true,
            hasUncertainty: hasUncertainty,
            note: 'Lời giải tính ra "$mentioned" nhưng trường đáp án chốt "$normalizedAns".',
          );
        }
      }
    }

    return ConsistencyReport(
      internalMismatch: false,
      hasUncertainty: hasUncertainty,
    );
  }

  static String _tailSentence(String text) {
    final t = text.trim();
    if (t.length <= 180) return t;
    return t.substring(t.length - 180);
  }
}
