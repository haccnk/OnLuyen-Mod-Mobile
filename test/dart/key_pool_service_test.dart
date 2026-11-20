import 'package:flutter_test/flutter_test.dart';
import 'package:onluyen_mod_mobile/services/key_pool_service.dart';

void main() {
  group('KeyPoolService', () {
    test('exempts JSON parse errors from cooldown penalty', () async {
      final pool = KeyPoolService();
      const testKey = 'dummy_key_alpha_0001';
      const model = 'gemini-3.1-flash-lite';

      await pool.markKeyPenalty(testKey, model, 'Không thể trích xuất đáp án từ chuỗi');
      expect(pool.getCooldownRemainingMs(testKey, model), 0);
    });

    test('applies 429 retryDelay cooldown and rotates across keys', () async {
      final pool = KeyPoolService();
      const keys = ['dummy_key_alpha_0001', 'dummy_key_beta_0002'];
      const model = 'gemini-3.1-flash-lite';
      const now = 1700000000000;

      final firstSlot = pool.acquireBestKeyForModel(model, keys, nowMs: now);
      expect(firstSlot?.apiKey, keys[0]);

      await pool.markKeyPenalty(
        keys[0],
        model,
        'HTTP 429 RESOURCE_EXHAUSTED "retryDelay": "22s"',
        nowMs: now,
      );
      expect(pool.getCooldownRemainingMs(keys[0], model, nowMs: now), 23000);

      final secondSlot = pool.acquireBestKeyForModel(model, keys, nowMs: now + 100);
      expect(secondSlot?.apiKey, keys[1]);
      expect(secondSlot?.waitMs, 0);
    });

    test('buildCrossModelOrder prioritizes models distinct from Agent 1 model', () {
      final order = KeyPoolService.buildCrossModelOrder(
        kAuditorModels,
        'gemini-3-flash-preview',
      );
      expect(order.first, isNot('gemini-3-flash-preview'));
      expect(order.last, 'gemini-3-flash-preview');
    });
  });
}
