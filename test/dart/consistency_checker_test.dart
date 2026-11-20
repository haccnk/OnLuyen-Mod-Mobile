import 'package:flutter_test/flutter_test.dart';
import 'package:onluyen_mod_mobile/services/consistency_checker.dart';

void main() {
  group('ConsistencyChecker', () {
    test('detects MCQ mismatch between step conclusion and final choice', () {
      final report = ConsistencyChecker.check(
        questionType: 'MCQ',
        normalizedAns: 'B',
        step: 'Suy ra giá trị cực đại là 5 nên chọn A.',
        selfCheck: 'Kết luận đáp án A.',
      );
      expect(report.internalMismatch, isTrue);
    });

    test('passes consistent MCQ answer', () {
      final report = ConsistencyChecker.check(
        questionType: 'MCQ',
        normalizedAns: 'C',
        step: 'Thay x = 2 vào phương trình được 10, chọn C.',
        selfCheck: 'Đã kiểm tra lại, đáp án C chính xác.',
      );
      expect(report.internalMismatch, isFalse);
      expect(report.hasUncertainty, isFalse);
    });

    test('detects TRUE_FALSE statement mismatch and uncertainty cues', () {
      final report = ConsistencyChecker.check(
        questionType: 'TRUE_FALSE',
        normalizedAns: 'Đ-S-Đ-S',
        step: 'a) Đúng vì 1+1=2; b) Đúng vì 2+2=4; c) Đúng; d) Sai.',
        selfCheck: 'Hơi phân vân ý b nhưng tạm chọn.',
      );
      expect(report.internalMismatch, isTrue);
      expect(report.hasUncertainty, isTrue);
    });
  });
}
