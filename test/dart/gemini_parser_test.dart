import 'package:flutter_test/flutter_test.dart';
import 'package:onluyen_mod_mobile/services/gemini_client.dart';

void main() {
  group('GeminiClient parsers & normalizers', () {
    test('parseRobustGeminiOutput handles fenced markdown JSON and trailing commas', () {
      const raw = '''```json
{
  "subject": "Toán",
  "step": "Tính tích phân được -8",
  "answerKind": "NUMBER",
  "shortAnswer": "-8.0",
  "confidence": 95,
}
```''';
      final parsed = GeminiClient.parseRobustGeminiOutput(raw, 'SHORT_ANSWER');
      expect(parsed['subject'], 'Toán');
      expect(GeminiClient.normAns('SHORT_ANSWER', parsed), '-8,0');
    });

    test('normalizeShortAnswer distinguishes NUMBER with comma vs TEXT with spaces', () {
      final numRes = GeminiClient.normalizeShortAnswer(' -12.5 ', 'NUMBER');
      expect(numRes.kind, 'NUMBER');
      expect(numRes.text, '-12,5');

      final textRes = GeminiClient.normalizeShortAnswer('  break   out  ', 'TEXT');
      expect(textRes.kind, 'TEXT');
      expect(textRes.text, 'break out');
    });

    test('normAns formats TRUE_FALSE to Đ-S-Đ-S', () {
      final ans = GeminiClient.normAns('TRUE_FALSE', {
        'trueFalseList': [true, false, true, false],
      });
      expect(ans, 'Đ-S-Đ-S');
    });
  });
}
