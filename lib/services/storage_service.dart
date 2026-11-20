import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/api_key_entry.dart';
import '../models/quiz_history_item.dart';
import '../models/solver_models.dart';

class StorageService {
  static const _kApiKeys = 'onluyen_mod_api_keys_v1';
  static const _kCooldowns = 'onluyen_mod_cooldowns_v1';
  static const _kEnabled = 'onluyen_mod_enabled_v1';
  static const _kAutoAdvance = 'onluyen_mod_auto_advance_v1';
  static const _kDesktopMode = 'onluyen_mod_desktop_mode_v1';
  static const _kMode = 'onluyen_mod_intelligence_mode_v1';
  static const _kHistory = 'onluyen_mod_quiz_history_v1';
  static const int maxHistoryItems = 300;

  SharedPreferences? _prefs;

  Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  Future<SharedPreferences> _ensurePrefs() async {
    _prefs ??= await SharedPreferences.getInstance();
    return _prefs!;
  }

  // Mặc định 0 API Key lưu cứng — người dùng tự nhập trong phần Cài đặt
  Future<List<ApiKeyEntry>> loadApiKeys() async {
    final prefs = await _ensurePrefs();
    final raw = prefs.getString(_kApiKeys);
    if (raw == null || raw.trim().isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded
            .whereType<Map>()
            .map((e) => ApiKeyEntry.fromJson(Map<String, dynamic>.from(e)))
            .where((e) => e.key.trim().isNotEmpty)
            .toList();
      }
    } catch (_) {}
    return [];
  }

  Future<void> saveApiKeys(List<ApiKeyEntry> entries) async {
    final prefs = await _ensurePrefs();
    final encoded = jsonEncode(entries.map((e) => e.toJson()).toList());
    await prefs.setString(_kApiKeys, encoded);
  }

  Future<Map<String, int>> loadCooldowns() async {
    final prefs = await _ensurePrefs();
    final raw = prefs.getString(_kCooldowns);
    if (raw == null || raw.trim().isEmpty) return {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        final now = DateTime.now().millisecondsSinceEpoch;
        final result = <String, int>{};
        for (final entry in decoded.entries) {
          final v = entry.value;
          if (v is num && v.toInt() > now) {
            result[entry.key.toString()] = v.toInt();
          }
        }
        return result;
      }
    } catch (_) {}
    return {};
  }

  Future<void> saveCooldowns(Map<String, int> cooldowns) async {
    final prefs = await _ensurePrefs();
    await prefs.setString(_kCooldowns, jsonEncode(cooldowns));
  }

  Future<bool> loadEnabled() async {
    final prefs = await _ensurePrefs();
    return prefs.getBool(_kEnabled) ?? true;
  }

  Future<void> saveEnabled(bool value) async {
    final prefs = await _ensurePrefs();
    await prefs.setBool(_kEnabled, value);
  }

  Future<bool> loadAutoAdvance() async {
    final prefs = await _ensurePrefs();
    return prefs.getBool(_kAutoAdvance) ?? true;
  }

  Future<void> saveAutoAdvance(bool value) async {
    final prefs = await _ensurePrefs();
    await prefs.setBool(_kAutoAdvance, value);
  }

  Future<bool> loadDesktopMode() async {
    final prefs = await _ensurePrefs();
    return prefs.getBool(_kDesktopMode) ?? false;
  }

  Future<void> saveDesktopMode(bool value) async {
    final prefs = await _ensurePrefs();
    await prefs.setBool(_kDesktopMode, value);
  }

  Future<IntelligenceMode> loadIntelligenceMode() async {
    final prefs = await _ensurePrefs();
    return IntelligenceModeX.fromString(prefs.getString(_kMode));
  }

  Future<void> saveIntelligenceMode(IntelligenceMode mode) async {
    final prefs = await _ensurePrefs();
    await prefs.setString(_kMode, mode.apiName);
  }

  Future<List<QuizHistoryItem>> loadHistory() async {
    final prefs = await _ensurePrefs();
    final raw = prefs.getString(_kHistory);
    if (raw == null || raw.trim().isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is List) {
        return decoded
            .whereType<Map>()
            .map((e) => QuizHistoryItem.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
    } catch (_) {}
    return [];
  }

  Future<void> saveHistory(List<QuizHistoryItem> items) async {
    final prefs = await _ensurePrefs();
    final trimmed = items.length > maxHistoryItems
        ? items.sublist(items.length - maxHistoryItems)
        : items;
    await prefs.setString(_kHistory, jsonEncode(trimmed.map((e) => e.toJson()).toList()));
  }
}
