import '../models/solver_models.dart';

class RiskAssessment {
  final int score;
  final List<String> reasons;

  const RiskAssessment({
    required this.score,
    required this.reasons,
  });
}

class RiskScorer {
  static final RegExp _negationPolarityRe = RegExp(
    r'\b(KHÔNG|SAI|NGOẠI\s+TRỪ|OPPOSITE|TRỪ|ÍT\s+NHẤT|KHÁC|NOT|EXCEPT|FALSE|INCORRECT|CHỌN\s+CÂU\s+SAI)\b',
    caseSensitive: false,
  );

  static final RegExp _mathCalcRe = RegExp(
    r'(\$|\\frac|\\sqrt|\\int|\\vec|\\sum|\\lim|(?:\d\s*[+\-*/=<>^]\s*\d))',
    caseSensitive: false,
  );

  static RiskAssessment score(QuizSolveRequest req) {
    var total = 0;
    final reasons = <String>[];

    if (req.isManualRetry) {
      total += 100;
      reasons.add('Giải lại thủ công (+100)');
    }

    if (req.questionType == 'TRUE_FALSE') {
      total += 25;
      reasons.add('Dạng Đúng/Sai 4 ý (+25)');
    } else if (req.questionType == 'SHORT_ANSWER') {
      total += 20;
      reasons.add('Dạng Trả lời ngắn (+20)');
    }

    final combined = '${req.rawScreenText}\n${req.extraDetails}';
    if (_negationPolarityRe.hasMatch(combined)) {
      total += 25;
      reasons.add('Từ khóa phủ định / đảo cực tính (+25)');
    }

    if (req.hasVisuals ||
        req.hasTable ||
        req.hasUnderline ||
        combined.contains('[HÌNH_') ||
        combined.contains('[GẠCH_CHÂN:')) {
      total += 20;
      reasons.add('Có hình ảnh / bảng / gạch chân (+20)');
    }

    if (_mathCalcRe.hasMatch(combined)) {
      total += 20;
      reasons.add('Có LaTeX / tính toán (+20)');
    }

    if (req.contextPassage.trim().isNotEmpty) {
      total += 15;
      reasons.add('Có đoạn văn đọc hiểu (+15)');
    }

    final clamped = total.clamp(0, 100);
    return RiskAssessment(score: clamped, reasons: reasons);
  }
}
