import 'package:flutter_test/flutter_test.dart';
import 'package:onluyen_mod_mobile/models/solver_models.dart';
import 'package:onluyen_mod_mobile/services/risk_scorer.dart';

void main() {
  group('RiskScorer', () {
    test('scores simple MCQ low', () {
      const req = QuizSolveRequest(
        questionType: 'MCQ',
        qCode: 'Câu 1',
        rawScreenText: 'Thủ đô của Việt Nam là thành phố nào?',
      );
      final assessment = RiskScorer.score(req);
      expect(assessment.score, 0);
      expect(assessment.reasons, isEmpty);
    });

    test('scores TRUE_FALSE with negation, LaTeX, visuals, and passage accurately (clamped <= 100)', () {
      const req = QuizSolveRequest(
        questionType: 'TRUE_FALSE',
        qCode: 'Câu 2',
        rawScreenText: r'Phát biểu nào KHÔNG đúng về hàm số $y = \frac{x+1}{x-1}$?',
        contextPassage: 'Đoạn ngữ cảnh dài đọc hiểu...',
        hasVisuals: true,
      );
      final assessment = RiskScorer.score(req);
      // 25 (TF) + 25 (KHÔNG) + 20 (visuals) + 20 (LaTeX) + 15 (passage) = 105 -> clamped to 100
      expect(assessment.score, 100);
      expect(assessment.reasons.length, 5);
    });

    test('manual retry boosts risk score to 100', () {
      const req = QuizSolveRequest(
        questionType: 'SHORT_ANSWER',
        qCode: 'Câu 3',
        rawScreenText: 'Tính tổng',
        isManualRetry: true,
      );
      final assessment = RiskScorer.score(req);
      expect(assessment.score, 100);
    });
  });
}
