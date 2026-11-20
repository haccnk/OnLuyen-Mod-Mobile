import 'storage_service.dart';

const List<String> kPrimaryModels = [
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
];

const List<String> kAuditorModels = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

class _KeyModelState {
  final String apiKey;
  final String model;
  int lastUsedAtMs = 0;
  int cooldownUntilMs = 0;
  int failCount = 0;

  _KeyModelState({
    required this.apiKey,
    required this.model,
  });
}

class KeySlot {
  final String apiKey;
  final int waitMs;
  final int keyIndex;

  const KeySlot({
    required this.apiKey,
    required this.waitMs,
    required this.keyIndex,
  });

  String get maskedKey {
    if (apiKey.length <= 10) return 'Key#$keyIndex';
    return 'Key#$keyIndex(${apiKey.substring(0, 5)}...${apiKey.substring(apiKey.length - 4)})';
  }
}

class KeyPoolService {
  static const int perKeyMinIntervalMs = 1800;
  static const int cooldown429DefaultMs = 20000;
  static const int cooldownTimeoutMs = 5000;
  static const int cooldownServerErrMs = 4000;

  final StorageService? _storage;
  final Map<String, _KeyModelState> _states = {};
  final Map<String, int> _persistedCooldowns = {};
  int _roundRobinCursor = 0;

  KeyPoolService({StorageService? storage}) : _storage = storage;

  String _stateId(String apiKey, String model) => '${model}__$apiKey';

  _KeyModelState _getState(String apiKey, String model) {
    final id = _stateId(apiKey, model);
    return _states.putIfAbsent(
      id,
      () => _KeyModelState(apiKey: apiKey, model: model),
    );
  }

  Future<void> loadPersistedCooldowns() async {
    if (_storage == null) return;
    final loaded = await _storage.loadCooldowns();
    applyPersistedCooldowns(loaded);
  }

  void applyPersistedCooldowns(Map<String, int> loaded, {int? nowMs}) {
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    _persistedCooldowns.clear();
    for (final entry in loaded.entries) {
      if (entry.value <= now) continue;
      final sepIdx = entry.key.indexOf('__');
      if (sepIdx <= 0) continue;
      final model = entry.key.substring(0, sepIdx);
      final key = entry.key.substring(sepIdx + 2);
      final st = _getState(key, model);
      if (entry.value > st.cooldownUntilMs) {
        st.cooldownUntilMs = entry.value;
      }
      _persistedCooldowns[entry.key] = entry.value;
    }
  }

  Future<void> _syncPersistedCooldown(String id, int untilMs, {int? nowMs}) async {
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    _persistedCooldowns.removeWhere((_, v) => v <= now);
    if (untilMs > now) {
      _persistedCooldowns[id] = untilMs;
    } else {
      _persistedCooldowns.remove(id);
    }
    if (_storage != null) {
      await _storage.saveCooldowns(Map<String, int>.from(_persistedCooldowns));
    }
  }

  int getCooldownRemainingMs(String apiKey, String model, {int? nowMs}) {
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final st = _states[_stateId(apiKey, model)];
    if (st == null) return 0;
    final rem = st.cooldownUntilMs - now;
    return rem > 0 ? rem : 0;
  }

  static int parseRetryDelayMs(String errMsg) {
    final matchSec = RegExp(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"', caseSensitive: false)
        .firstMatch(errMsg);
    if (matchSec != null) {
      final sec = double.tryParse(matchSec.group(1) ?? '');
      if (sec != null && sec.isFinite) {
        return (sec * 1000).ceil() + 1000;
      }
    }
    if (RegExp(r'GenerateRequestsPerDay|PerDay|requests per day', caseSensitive: false)
        .hasMatch(errMsg)) {
      return 3600000;
    }
    return cooldown429DefaultMs;
  }

  static bool isNonPenaltyParseError(String errMsg) {
    return errMsg.contains('Không thể trích xuất đáp án') ||
        errMsg.contains('Chuỗi phản hồi rỗng') ||
        errMsg.contains('trả về rỗng') ||
        errMsg.contains('FormatException');
  }

  Future<void> markKeySuccess(String apiKey, String model, {int? nowMs}) async {
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final st = _getState(apiKey, model);
    st.lastUsedAtMs = now;
    st.cooldownUntilMs = 0;
    st.failCount = 0;
    await _syncPersistedCooldown(_stateId(apiKey, model), 0, nowMs: now);
  }

  Future<void> markKeyPenalty(String apiKey, String model, String errMsg, {int? nowMs}) async {
    // Không phạt cooldown model/key khi lỗi chỉ do parse JSON
    if (isNonPenaltyParseError(errMsg)) {
      return;
    }

    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final st = _getState(apiKey, model);
    st.lastUsedAtMs = now;
    st.failCount += 1;

    if (errMsg.contains('429') || errMsg.contains('RESOURCE_EXHAUSTED')) {
      final waitDuration = parseRetryDelayMs(errMsg);
      st.cooldownUntilMs = now + waitDuration;
      if (waitDuration > 15000 ||
          RegExp(r'PerDay|requests per day', caseSensitive: false).hasMatch(errMsg)) {
        await _syncPersistedCooldown(_stateId(apiKey, model), st.cooldownUntilMs, nowMs: now);
      }
    } else if (errMsg.contains('TIMEOUT')) {
      st.cooldownUntilMs = now + cooldownTimeoutMs;
    } else if (errMsg.contains('403') ||
        errMsg.contains('API_KEY_INVALID') ||
        errMsg.contains('HTTP 400')) {
      st.cooldownUntilMs = now + 600000;
      await _syncPersistedCooldown(_stateId(apiKey, model), st.cooldownUntilMs, nowMs: now);
    } else if (errMsg.contains('HTTP 404')) {
      st.cooldownUntilMs = now + 3600000;
      await _syncPersistedCooldown(_stateId(apiKey, model), st.cooldownUntilMs, nowMs: now);
    } else {
      st.cooldownUntilMs = now + cooldownServerErrMs;
    }
  }

  KeySlot? acquireBestKeyForModel(String model, List<String> apiKeys, {int? nowMs}) {
    if (apiKeys.isEmpty) return null;
    final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
    final totalKeys = apiKeys.length;
    KeySlot? bestCandidate;
    int minWaitMs = 1 << 30;

    for (var i = 0; i < totalKeys; i++) {
      final idx = (_roundRobinCursor + i) % totalKeys;
      final key = apiKeys[idx];
      final st = _getState(key, model);

      final cooldownWait = (st.cooldownUntilMs - now).clamp(0, 1 << 30);
      final intervalWait = (st.lastUsedAtMs + perKeyMinIntervalMs - now).clamp(0, 1 << 30);
      final totalWait = cooldownWait > intervalWait ? cooldownWait : intervalWait;

      if (totalWait == 0) {
        _roundRobinCursor = (idx + 1) % totalKeys;
        st.lastUsedAtMs = now;
        return KeySlot(apiKey: key, waitMs: 0, keyIndex: idx + 1);
      }

      if (totalWait < minWaitMs) {
        minWaitMs = totalWait;
        bestCandidate = KeySlot(apiKey: key, waitMs: totalWait, keyIndex: idx + 1);
      }
    }

    _roundRobinCursor = (_roundRobinCursor + 1) % totalKeys;
    if (bestCandidate != null && bestCandidate.waitMs <= 12000) {
      final st = _getState(bestCandidate.apiKey, model);
      st.lastUsedAtMs = now + bestCandidate.waitMs;
    }
    return bestCandidate;
  }

  static List<String> buildCrossModelOrder(List<String> baseModels, String? avoidModel) {
    if (avoidModel == null || avoidModel.isEmpty) {
      return List<String>.from(baseModels);
    }
    final different = baseModels.where((m) => m != avoidModel).toList();
    final same = baseModels.where((m) => m == avoidModel).toList();
    return [...different, ...same];
  }

  Future<void> clearAllCooldowns() async {
    _states.clear();
    _persistedCooldowns.clear();
    if (_storage != null) {
      await _storage.saveCooldowns({});
    }
  }

  Map<String, int> get persistedCooldownSnapshot => Map<String, int>.unmodifiable(_persistedCooldowns);
}
