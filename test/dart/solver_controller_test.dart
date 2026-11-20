import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:onluyen_mod_mobile/controllers/solver_controller.dart';
import 'package:onluyen_mod_mobile/models/solver_models.dart';
import 'package:onluyen_mod_mobile/services/gemini_client.dart';
import 'package:onluyen_mod_mobile/services/key_pool_service.dart';
import 'package:onluyen_mod_mobile/services/multi_agent_solver.dart';
import 'package:onluyen_mod_mobile/services/storage_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response _geminiOkResponse(String answerLetter) {
  final innerJson = jsonEncode({
    'subject': 'Dia li',
    'step': 'Ha Noi la thu do cua Viet Nam.',
    'selfCheck': 'Khop yeu cau de.',
    'mcqAnswer': answerLetter,
    'confidence': 96,
  });
  final payload = jsonEncode({
    'candidates': [
      {
        'finishReason': 'STOP',
        'content': {
          'parts': [
            {'text': innerJson}
          ],
        },
      }
    ],
  });
  return http.Response.bytes(
    utf8.encode(payload),
    200,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );
}

void main() {
  group('SolverController & Gemini 3 / KeyPool Integration', () {
    test('SolverController shares exact same KeyPoolService and GeminiClient with MultiAgentSolver', () async {
      SharedPreferences.setMockInitialValues({});
      final storage = StorageService();
      final controller = SolverController(storage: storage);
      await controller.init();

      expect(identical(controller.keyPool, controller.multiAgentSolver.keyPool), isTrue);
      expect(identical(controller.geminiClient, controller.multiAgentSolver.client), isTrue);
    });

    test('GeminiClient.buildThinkingConfig selects thinkingLevel for Gemini 3 and thinkingBudget otherwise', () {
      expect(
        GeminiClient.buildThinkingConfig('gemini-3.1-flash-lite', 1024),
        equals({'thinkingLevel': 'LOW'}),
      );
      expect(
        GeminiClient.buildThinkingConfig('gemini-3-flash-preview', 3072),
        equals({'thinkingLevel': 'MEDIUM'}),
      );
      expect(
        GeminiClient.buildThinkingConfig('gemini-3.1-flash-lite', 4096),
        equals({'thinkingLevel': 'HIGH'}),
      );
      expect(
        GeminiClient.buildThinkingConfig('gemini-2.5-flash', 2048),
        equals({'thinkingBudget': 2048}),
      );
    });

    test('MultiAgentSolver rotates to Key #2 on SAME model after 429, and switches model on 404', () async {
      const keys = ['dummy_key_alpha_0001', 'dummy_key_beta_0002'];
      const mcqReq = QuizSolveRequest(
        questionType: 'MCQ',
        qCode: 'Cau 1',
        rawScreenText: 'Thu do cua Viet Nam?',
        intelligenceMode: IntelligenceMode.fast,
      );

      // 1. 429 trên Key #1 -> xoay sang Key #2 trên CÙNG model đầu tiên
      final attempts429 = <String>[];
      final client429 = GeminiClient(
        httpClient: MockClient((request) async {
          final key = request.url.queryParameters['key'] ?? '';
          final seg = request.url.pathSegments.lastWhere((s) => s.contains(':'), orElse: () => '');
          final model = seg.split(':').first;
          attempts429.add('$model::$key');

          if (attempts429.length == 1) {
            return http.Response('{"error":{"code":429,"message":"RESOURCE_EXHAUSTED"}}', 429);
          }
          return _geminiOkResponse('A');
        }),
      );
      final solver429 = MultiAgentSolver(keyPool: KeyPoolService(), client: client429);
      final res429 = await solver429.solve(mcqReq, keys);

      expect(res429.normalizedAns, 'A');
      expect(attempts429.length, 2);
      expect(attempts429[0], '${kPrimaryModels[0]}::${keys[0]}');
      expect(attempts429[1], '${kPrimaryModels[0]}::${keys[1]}');

      // 2. 404 trên Model #1 -> nhảy ngay sang Model #2
      final attempts404 = <String>[];
      final client404 = GeminiClient(
        httpClient: MockClient((request) async {
          final key = request.url.queryParameters['key'] ?? '';
          final seg = request.url.pathSegments.lastWhere((s) => s.contains(':'), orElse: () => '');
          final model = seg.split(':').first;
          attempts404.add('$model::$key');

          if (attempts404.length == 1) {
            return http.Response('{"error":{"code":404,"message":"Model not found"}}', 404);
          }
          return _geminiOkResponse('B');
        }),
      );
      final solver404 = MultiAgentSolver(keyPool: KeyPoolService(), client: client404);
      final res404 = await solver404.solve(mcqReq, keys);

      expect(res404.normalizedAns, 'B');
      expect(attempts404.length, 2);
      expect(attempts404[0].startsWith('${kPrimaryModels[0]}::'), isTrue);
      expect(attempts404[1].startsWith('${kPrimaryModels[1]}::'), isTrue);
    });

    test('Disabling Mod cancels in-flight solveQuiz and blocks stale JS syncStatus updates', () async {
      SharedPreferences.setMockInitialValues({});
      final storage = StorageService();
      final requestSent = Completer<void>();
      final finishResponse = Completer<void>();

      final mockClient = GeminiClient(
        httpClient: MockClient((request) async {
          if (!requestSent.isCompleted) requestSent.complete();
          await finishResponse.future;
          return _geminiOkResponse('C');
        }),
      );

      final controller = SolverController(
        storage: storage,
        geminiClient: mockClient,
      );
      await controller.init();
      await controller.addApiKeys(rawKeysInput: 'dummy_key_alpha_0001');
      await controller.toggleEnabled(true);
      expect(controller.isSessionActive, isTrue);

      final solveFuture = controller.handleSolveQuizForTest({
        'questionType': 'MCQ',
        'qCode': 'Câu 1',
        'rawScreenText': 'Chọn đáp án đúng?',
        'intelligenceMode': 'fast',
      });

      await requestSent.future;
      // Tắt Mod trong khi request AI đang chờ phản hồi
      await controller.toggleEnabled(false);
      expect(controller.state.enabled, isFalse);
      expect(controller.state.pillState, PillVisualState.paused);

      // Các ping syncStatus trễ từ JS phải bị bỏ qua khi Mod đã tắt
      controller.handleJsSyncStatusForTest({
        'solverStatus': '🧠 Đang giải Câu 1...',
        'lastSolvedAnswer': 'Câu 1: A',
      });
      expect(controller.state.pillState, PillVisualState.paused);

      // Response AI về muộn không được ghi đè trạng thái paused
      finishResponse.complete();
      final res = await solveFuture;
      expect(res['cancelled'], isTrue);
      expect(res['success'], isFalse);
      expect(controller.state.enabled, isFalse);
      expect(controller.state.pillState, PillVisualState.paused);
    });
  });
}
