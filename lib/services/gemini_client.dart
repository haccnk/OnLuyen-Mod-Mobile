import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/api_key_entry.dart';
import '../models/solver_models.dart';

class ShortAnswerNormalized {
  final String text;
  final String kind;

  const ShortAnswerNormalized({required this.text, required this.kind});
}

class GeminiCallResult {
  final Map<String, dynamic> parsed;
  final String rawText;
  final String finishReason;

  const GeminiCallResult({
    required this.parsed,
    required this.rawText,
    required this.finishReason,
  });
}

class LiveKeyTestReport {
  final ApiKeyStatus overallStatus;
  final int? bestLatencyMs;
  final String summary;
  final Map<String, ModelLiveStatus> modelStatuses;

  const LiveKeyTestReport({
    required this.overallStatus,
    this.bestLatencyMs,
    required this.summary,
    required this.modelStatuses,
  });
}

class GeminiClient {
  static const int requestTimeoutMs = 25000;
  static const List<String> liveTestModels = [
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
  ];

  final http.Client _httpClient;

  GeminiClient({http.Client? httpClient}) : _httpClient = httpClient ?? http.Client();

  static ShortAnswerNormalized normalizeShortAnswer(dynamic rawVal, String? answerKind) {
    final s = (rawVal ?? '').toString().trim();
    if (s.isEmpty) {
      return ShortAnswerNormalized(text: '', kind: answerKind ?? 'NUMBER');
    }

    final hasLetters = RegExp(r'[A-Za-zÀ-ỹ]').hasMatch(s);
    final hasNumberWithUnitOnly = RegExp(r'^-?\d+([.,]\d+)?\s*[a-zA-Z°/%]+$').hasMatch(s);
    final effectiveKind = (answerKind == 'TEXT' || (hasLetters && !hasNumberWithUnitOnly))
        ? 'TEXT'
        : 'NUMBER';

    if (effectiveKind == 'TEXT') {
      return ShortAnswerNormalized(
        text: s.replaceAll(RegExp(r'\s+'), ' ').trim(),
        kind: 'TEXT',
      );
    }

    final compact = s.replaceAll(RegExp(r'\s+'), '');
    final numMatch = RegExp(r'-?\d+(?:[.,]\d+)?').firstMatch(compact);
    final cleanedNum = (numMatch?.group(0) ?? compact).replaceAll('.', ',');
    return ShortAnswerNormalized(text: cleanedNum, kind: 'NUMBER');
  }

  static List<bool>? extractTFListFromEvaluations(dynamic evals) {
    if (evals is! List || evals.length < 4) return null;
    const order = ['a', 'b', 'c', 'd'];
    final byLabel = <String, bool>{};

    for (var idx = 0; idx < evals.length; idx++) {
      final item = evals[idx];
      if (item is! Map) continue;
      final rawLbl = (item['label'] ?? order[idx < 4 ? idx : 0]).toString().trim().toLowerCase();
      final lbl = rawLbl.replaceAll(RegExp(r'[^a-d]'), '');
      if (lbl.isNotEmpty && !byLabel.containsKey(lbl) && item['isTrue'] is bool) {
        byLabel[lbl] = item['isTrue'] as bool;
      }
    }

    if (order.every(byLabel.containsKey)) {
      return order.map((k) => byLabel[k]!).toList();
    }
    if (evals.length >= 4) {
      final seq = evals.take(4).map((e) => e is Map && e['isTrue'] == true).toList();
      if (seq.length == 4) return seq;
    }
    return null;
  }

  static bool detectTFInternalConflict(Map<String, dynamic>? obj) {
    if (obj == null) return false;
    final evalList = extractTFListFromEvaluations(obj['statementEvaluations']);
    final raw = obj['trueFalseList'];
    if (evalList == null || raw is! List || raw.length < 4) return false;
    final rawList = raw.take(4).map((e) => e == true).toList();
    for (var i = 0; i < 4; i++) {
      if (evalList[i] != rawList[i]) return true;
    }
    return false;
  }

  static String normAns(String type, Map<String, dynamic>? obj) {
    if (obj == null) return '';
    if (type == 'MCQ') {
      final raw = (obj['mcqAnswer'] ?? obj['finalMcqAnswer'] ?? '').toString().trim().toUpperCase();
      final m = RegExp(r'[A-D]').firstMatch(raw);
      return m?.group(0) ?? '';
    }
    if (type == 'SHORT_ANSWER') {
      final raw = obj['shortAnswer'] ?? obj['finalShortAnswer'] ?? '';
      return normalizeShortAnswer(raw, obj['answerKind']?.toString()).text;
    }
    if (type == 'TRUE_FALSE') {
      final evalList = extractTFListFromEvaluations(obj['statementEvaluations'] ?? obj['statementVerdicts']);
      final rawList = obj['trueFalseList'] is List
          ? obj['trueFalseList'] as List
          : (obj['finalTrueFalseList'] is List ? obj['finalTrueFalseList'] as List : null);
      final chosen = evalList ??
          (rawList != null && rawList.length >= 4
              ? rawList.take(4).map((v) => v == true).toList()
              : null);
      if (chosen != null) {
        return chosen.map((v) => v ? 'Đ' : 'S').join('-');
      }
    }
    return '';
  }

  static Map<String, dynamic> parseRobustGeminiOutput(String rawText, String questionType) {
    if (rawText.trim().isEmpty) {
      throw const FormatException('Chuỗi phản hồi rỗng');
    }
    var cleaned = rawText.trim();
    cleaned = cleaned
        .replaceFirst(RegExp(r'^```(?:json)?\s*', caseSensitive: false), '')
        .replaceFirst(RegExp(r'\s*```$'), '')
        .trim();

    try {
      final decoded = jsonDecode(cleaned);
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
    } catch (_) {}

    final firstBrace = cleaned.indexOf('{');
    final lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace != -1 && lastBrace > firstBrace) {
      final candidate = cleaned.substring(firstBrace, lastBrace + 1);
      try {
        final decoded = jsonDecode(candidate);
        if (decoded is Map) return Map<String, dynamic>.from(decoded);
      } catch (_) {
        try {
          final fixed = candidate
              .replaceAll(RegExp(r',\s*}'), '}')
              .replaceAll(RegExp(r',\s*]'), ']');
          final decoded = jsonDecode(fixed);
          if (decoded is Map) return Map<String, dynamic>.from(decoded);
        } catch (_) {}
      }
    }

    final stepMatch = RegExp(
      r'"(?:stepByStep|step|independentAnalysis)"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|$)',
      caseSensitive: false,
    ).firstMatch(cleaned);
    final extractedStep = (stepMatch?.group(1) ?? '').replaceAll(r'\n', ' ').trim();

    if (questionType == 'MCQ') {
      final mKey = RegExp(r'"(?:finalMcqAnswer|mcqAnswer)"\s*:\s*"([A-D])"', caseSensitive: false)
              .firstMatch(cleaned) ??
          RegExp(r'"(?:finalMcqAnswer|mcqAnswer)"\s*:\s*"?([A-D])', caseSensitive: false)
              .firstMatch(cleaned);
      if (mKey != null) {
        return {
          'step': extractedStep,
          'mcqAnswer': mKey.group(1)!.toUpperCase(),
          'confidence': 70,
        };
      }
      final mStandalone = RegExp(r'\b([A-D])\b\s*$').firstMatch(cleaned);
      if (mStandalone != null) {
        return {
          'step': extractedStep,
          'mcqAnswer': mStandalone.group(1)!.toUpperCase(),
          'confidence': 60,
        };
      }
    } else if (questionType == 'SHORT_ANSWER') {
      final mShort = RegExp(r'"(?:finalShortAnswer|shortAnswer)"\s*:\s*"([^"]*)"', caseSensitive: false)
          .firstMatch(cleaned);
      if (mShort != null) {
        return {
          'step': extractedStep,
          'shortAnswer': mShort.group(1)!.trim(),
          'confidence': 70,
        };
      }
      final nums = RegExp(r'-?\d+(?:[.,]\d+)?').allMatches(cleaned).toList();
      if (nums.isNotEmpty) {
        return {
          'step': extractedStep,
          'shortAnswer': nums.last.group(0)!,
          'confidence': 60,
        };
      }
    } else if (questionType == 'TRUE_FALSE') {
      final bools = RegExp(r'\b(true|false)\b', caseSensitive: false).allMatches(cleaned).toList();
      if (bools.length >= 4) {
        final tail = bools.sublist(bools.length - 4);
        return {
          'step': extractedStep,
          'trueFalseList': tail.map((m) => m.group(1)!.toLowerCase() == 'true').toList(),
          'confidence': 70,
        };
      }
    }

    final preview = cleaned.length > 180 ? cleaned.substring(0, 180) : cleaned;
    throw FormatException('Không thể trích xuất đáp án từ chuỗi: $preview');
  }

  static Map<String, dynamic> buildThinkingConfig(String model, int thinkingBudget) {
    if (model.toLowerCase().contains('gemini-3')) {
      final level = thinkingBudget <= 1024
          ? 'LOW'
          : (thinkingBudget <= 3584 ? 'MEDIUM' : 'HIGH');
      return {'thinkingLevel': level};
    }
    return {'thinkingBudget': thinkingBudget};
  }

  Future<GeminiCallResult> generateStructured({
    required String model,
    required String apiKey,
    required String systemText,
    required String prompt,
    required Map<String, dynamic> schema,
    required List<VisualAttachment> images,
    required double temperature,
    required int thinkingBudget,
    required String questionType,
    int timeoutMs = requestTimeoutMs,
  }) async {
    Future<({String text, String finishReason})> runOnce(
      String reqPrompt,
      Map<String, dynamic> thinkingConfig,
      int maxOutputTokens,
    ) async {
      final uri = Uri.parse(
        'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
      );
      final parts = <Map<String, dynamic>>[];
      for (final img in images) {
        if (img.base64Data.isEmpty) continue;
        parts.add({'text': img.label});
        parts.add({
          'inlineData': {
            'mimeType': img.mimeType,
            'data': img.base64Data,
          }
        });
      }
      parts.add({'text': reqPrompt});

      final body = jsonEncode({
        'systemInstruction': {
          'parts': [
            {'text': systemText}
          ]
        },
        'contents': [
          {'parts': parts}
        ],
        'generationConfig': {
          'temperature': temperature,
          'maxOutputTokens': maxOutputTokens,
          'thinkingConfig': thinkingConfig,
          'responseMimeType': 'application/json',
          'responseSchema': schema,
        },
      });

      final response = await _httpClient
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: body,
          )
          .timeout(
            Duration(milliseconds: timeoutMs),
            onTimeout: () => throw TimeoutException('TIMEOUT_${(timeoutMs / 1000).round()}S trên model $model'),
          );

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception('HTTP ${response.statusCode} ($model): ${response.body}');
      }

      final decoded = jsonDecode(response.body);
      final candidates = decoded is Map ? decoded['candidates'] : null;
      final first = candidates is List && candidates.isNotEmpty ? candidates.first : null;
      final finishReason = first is Map ? (first['finishReason'] ?? '').toString() : '';
      final content = first is Map ? first['content'] : null;
      final rawParts = content is Map && content['parts'] is List ? content['parts'] as List : const [];

      final nonThought = rawParts
          .whereType<Map>()
          .where((p) => p['thought'] != true && p['text'] is String)
          .map((p) => p['text'] as String)
          .toList();
      final fallbackParts = rawParts
          .whereType<Map>()
          .where((p) => p['text'] is String)
          .map((p) => p['text'] as String)
          .toList();

      final combined = (nonThought.isNotEmpty ? nonThought : fallbackParts).join('\n').trim();
      return (text: combined, finishReason: finishReason);
    }

    ({String text, String finishReason}) resp;
    final initialThinking = buildThinkingConfig(model, thinkingBudget);
    try {
      resp = await runOnce(prompt, initialThinking, 16384);
    } catch (err) {
      final msg = err.toString();
      if (msg.contains('HTTP 400') &&
          RegExp(r'thinkingBudget|thinkingLevel|thinkingConfig', caseSensitive: false).hasMatch(msg)) {
        final fallbackThinking = initialThinking.containsKey('thinkingLevel')
            ? <String, dynamic>{'thinkingBudget': thinkingBudget}
            : <String, dynamic>{
                'thinkingLevel': thinkingBudget >= 2048 ? 'MEDIUM' : 'LOW',
              };
        resp = await runOnce(prompt, fallbackThinking, 16384);
      } else {
        rethrow;
      }
    }

    var combinedText = resp.text;
    var finishReason = resp.finishReason;
    final looksTruncated = finishReason == 'MAX_TOKENS' || (combinedText.isNotEmpty && !combinedText.endsWith('}'));

    // Lưới cứu hộ MAX_TOKENS
    if (combinedText.isEmpty || looksTruncated) {
      final emergencyPrompt =
          '$prompt\n\n[KHẨN CẤP]: Viết "step" tối đa 20 từ và xuất đủ JSON đáp án hoàn chỉnh ngay lập tức!';
      try {
        final retryResp = await runOnce(emergencyPrompt, buildThinkingConfig(model, 512), 4096);
        if (retryResp.text.isNotEmpty) {
          combinedText = retryResp.text;
          finishReason = retryResp.finishReason;
        }
      } catch (_) {}
    }

    if (combinedText.isEmpty) {
      throw Exception('API ($model) trả về rỗng');
    }

    final parsed = parseRobustGeminiOutput(combinedText, questionType);
    return GeminiCallResult(parsed: parsed, rawText: combinedText, finishReason: finishReason);
  }

  Future<LiveKeyTestReport> testApiKeyLive(String apiKey) async {
    final trimmed = apiKey.trim();
    if (trimmed.isEmpty) {
      return const LiveKeyTestReport(
        overallStatus: ApiKeyStatus.error,
        summary: 'Key trống',
        modelStatuses: {},
      );
    }

    final results = <String, ModelLiveStatus>{};
    await Future.wait(
      liveTestModels.map((model) async {
        results[model] = await _pingModel(trimmed, model);
      }),
    );

    final aliveLatencies = results.values
        .where((r) => r.status == ApiKeyStatus.alive && r.latencyMs != null)
        .map((r) => r.latencyMs!)
        .toList();

    ApiKeyStatus overall;
    String summary;
    int? bestLatency;

    if (aliveLatencies.isNotEmpty) {
      aliveLatencies.sort();
      bestLatency = aliveLatencies.first;
      overall = ApiKeyStatus.alive;
      summary = 'Sống (${bestLatency}ms)';
    } else if (results.values.any((r) => r.status == ApiKeyStatus.rateLimited)) {
      overall = ApiKeyStatus.rateLimited;
      summary = 'Hết lượt tạm (429)';
    } else {
      overall = ApiKeyStatus.error;
      final firstErr = results.values.firstWhere(
        (r) => r.message.isNotEmpty,
        orElse: () => const ModelLiveStatus(status: ApiKeyStatus.error, message: 'Lỗi kết nối'),
      );
      summary = firstErr.message;
    }

    return LiveKeyTestReport(
      overallStatus: overall,
      bestLatencyMs: bestLatency,
      summary: summary,
      modelStatuses: results,
    );
  }

  Future<ModelLiveStatus> _pingModel(String apiKey, String model) async {
    final sw = Stopwatch()..start();
    try {
      final uri = Uri.parse(
        'https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey',
      );
      final resp = await _httpClient
          .post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'contents': [
                {
                  'parts': [
                    {'text': 'Reply with OK'}
                  ]
                }
              ],
              'generationConfig': {
                'temperature': 0.0,
                'maxOutputTokens': 16,
              },
            }),
          )
          .timeout(const Duration(seconds: 12));
      sw.stop();

      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return ModelLiveStatus(
          status: ApiKeyStatus.alive,
          latencyMs: sw.elapsedMilliseconds,
          message: 'OK (${sw.elapsedMilliseconds}ms)',
        );
      }

      if (resp.statusCode == 429 || resp.body.contains('RESOURCE_EXHAUSTED')) {
        return const ModelLiveStatus(
          status: ApiKeyStatus.rateLimited,
          message: '429 Hết lượt tạm',
        );
      }

      if (resp.statusCode == 400 || resp.statusCode == 403) {
        return ModelLiveStatus(
          status: ApiKeyStatus.error,
          message: 'Lỗi HTTP ${resp.statusCode}',
        );
      }

      return ModelLiveStatus(
        status: ApiKeyStatus.error,
        message: 'HTTP ${resp.statusCode}',
      );
    } on TimeoutException {
      sw.stop();
      return const ModelLiveStatus(
        status: ApiKeyStatus.error,
        message: 'Timeout 12s',
      );
    } catch (e) {
      sw.stop();
      return ModelLiveStatus(
        status: ApiKeyStatus.error,
        message: 'Lỗi mạng: ${e.toString().split('\n').first}',
      );
    }
  }
}
