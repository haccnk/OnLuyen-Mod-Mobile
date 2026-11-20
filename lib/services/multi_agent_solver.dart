import '../models/solver_models.dart';
import 'consistency_checker.dart';
import 'gemini_client.dart';
import 'key_pool_service.dart';
import 'risk_scorer.dart';

typedef StageProgressCallback = void Function(PillVisualState stage, String message);

class MultiAgentSolver {
  static const String expertSystemInstruction = '''
Bạn là Hội đồng chuyên gia giải đề thi THPT Quốc gia Việt Nam theo chương trình GDPT 2018 (Toán, Vật lí, Hóa học, Sinh học, Tin học, Tiếng Anh, Ngữ văn, Lịch sử, Địa lí, GDKT&PL).
NGUYÊN TẮC TỐI THƯỢNG:
1. Nếu có hình ảnh đính kèm: ĐỌC VÀ ĐỐI CHIẾU TRỰC TIẾP SỐ LIỆU, ĐỒ THỊ, BẢNG BIẾN THIÊN, DẤU GẠCH CHÂN, SỐ MŨ TỪ HÌNH ẢNH. Nếu văn bản DOM và hình ảnh khác nhau ở công thức/ký hiệu, ưu tiên HÌNH ẢNH.
2. Thực hiện toàn bộ bước nháp dài, xét cực tính ĐÚNG hay KHÔNG ĐÚNG / SAI / NGOẠI TRỪ / CLOSEST / OPPOSITE, phiên âm IPA/trọng âm cả 4 đáp án, đổi đơn vị SI và tự kiểm tra bẫy bên trong phần suy nghĩ nội tâm (thought); trường JSON "step" CHỈ ghi tóm tắt cốt lõi ngắn gọn (tối đa 3-4 câu / ~90 từ), trường "selfCheck" kiểm tra lại 1 câu xem đáp án khớp với lập luận chưa.
3. QUY TẮC CHỐNG BẪY MÔN HỌC:
   - Toán: Kiểm tra ĐKXĐ, tích vô hướng vectơ phải đưa về CÙNG ĐIỂM ĐẦU (vec(AB).vec(BC) = -AB.BC.cosB), bảng biến thiên & mẫu ghép nhóm SGK 2018; hypebol (H): trục thực 2a, tiêu cự 2c, |MF1 - MF2| = 2a.
   - Vật lí 2018: Phân biệt ĐỘ DỊCH CHUYỂN d (có dấu/hướng) với QUÃNG ĐƯỜNG s (>=0); VẬN TỐC TRUNG BÌNH v = d/t với TỐC ĐỘ TRUNG BÌNH s/t; đổi chuẩn đơn vị SI (km/h -> m/s, cm -> m, ms -> s, g -> kg).
   - Hóa học 2018: Danh pháp IUPAC mới, cấu hình e đặc biệt (Cr Z=24: [Ar]3d^5 4s^1, Cu Z=29: [Ar]3d^10 4s^1), bảo toàn e, hiệu suất H%, điều kiện chuẩn 25°C 1 bar (24,79 L/mol).
   - Tin học 2018: 1 KB = 1024 B (> 1000 B), phân biệt 2^10 với 210, Python range(a, b) dừng ở b - 1.
   - Tiếng Anh: Với thẻ [GẠCH_CHÂN: ...], phiên âm IPA / trọng âm cho CẢ 4 ĐÁP ÁN A, B, C, D trong phần thought trước khi chọn; với Đọc hiểu, đối chiếu dẫn chứng trong Đoạn văn ngữ cảnh.
4. TRẢ LỜI NGẮN (SHORT_ANSWER): Phân biệt ĐIỀN SỐ (answerKind="NUMBER", dùng dấu phẩy ',' cho số thập phân, không ghi đơn vị, làm tròn đúng yêu cầu hoặc vừa tối đa 4 ký tự gồm cả '-' và ',') với ĐIỀN TỪ/CỤM TỪ (answerKind="TEXT", giữ nguyên khoảng trắng).''';

  final KeyPoolService keyPool;
  final GeminiClient client;
  final Map<String, SolverResult> _cache = {};

  MultiAgentSolver({
    required this.keyPool,
    required this.client,
  });

  void clearCache() => _cache.clear();

  static String buildCacheKey(QuizSolveRequest req) {
    final passageHead = req.contextPassage.trim();
    final shortPassage = passageHead.length > 220 ? passageHead.substring(0, 220) : passageHead;
    final cleanRawText = req.rawScreenText.replaceAll(RegExp(r'\b\d{1,2}:\d{2}:\d{2}\b'), '').trim();
    return [
      req.intelligenceMode.apiName,
      req.questionType,
      req.qCode,
      shortPassage,
      cleanRawText,
      req.extraDetails.trim(),
      req.visualSignature.trim(),
    ].join('::');
  }

  static bool shouldRunAgent2({
    required IntelligenceMode mode,
    required QuizSolveRequest req,
    required int riskScore,
    required int confidence,
    required bool hasUncertainty,
    required bool internalMismatch,
    required String ans1,
  }) {
    if (req.isManualRetry || req.rejectedAnswers.contains(ans1)) {
      return true;
    }
    if (mode == IntelligenceMode.fast) {
      return false;
    }
    if (mode == IntelligenceMode.ultra) {
      if (req.questionType == 'TRUE_FALSE' || req.questionType == 'SHORT_ANSWER') {
        return true;
      }
      return riskScore >= 15 || confidence < 98 || hasUncertainty || internalMismatch;
    }
    // Chế độ smart
    return riskScore >= 40 || confidence < 88 || hasUncertainty || internalMismatch;
  }

  static bool shouldRunAgent3({
    required IntelligenceMode mode,
    required bool agent2Ran,
    required String ans1,
    required String ans2,
    required int conf2,
  }) {
    if (!agent2Ran || ans2.isEmpty || ans2 == ans1) {
      return false;
    }
    return conf2 < 95 || mode == IntelligenceMode.ultra;
  }

  Future<SolverResult> solve(
    QuizSolveRequest req,
    List<String> apiKeys, {
    StageProgressCallback? onStage,
  }) async {
    if (apiKeys.isEmpty) {
      throw Exception('Chưa cấu hình API Key nào! Vui lòng vào Cài đặt để thêm Gemini API Key.');
    }

    final cacheKey = buildCacheKey(req);
    if (req.isManualRetry) {
      _cache.remove(cacheKey);
    } else if (_cache.containsKey(cacheKey)) {
      return _cache[cacheKey]!;
    }

    // =========================================================================
    // TẦNG 0: ĐÁNH GIÁ ĐỘ RẮC RỐI (RISK SCORER)
    // =========================================================================
    final risk = RiskScorer.score(req);

    // =========================================================================
    // TẦNG 1: AGENT 1 — PRIMARY DEEP SOLVER + TỰ RECHECK NHẤT QUÁN NỘI BỘ
    // =========================================================================
    onStage?.call(PillVisualState.scanning, 'Agent 1 đang phân tích ${req.qCode}...');

    final int pass1Budget;
    if (req.intelligenceMode == IntelligenceMode.fast) {
      pass1Budget = 1024;
    } else if (req.intelligenceMode == IntelligenceMode.ultra || risk.score >= 50) {
      pass1Budget = 4096;
    } else {
      pass1Budget = 3072;
    }

    final pass1Spec = _buildPass1Spec(req);
    final pass1Call = await _callWithRotation(
      modelList: kPrimaryModels,
      apiKeys: apiKeys,
      systemText: expertSystemInstruction,
      prompt: pass1Spec.prompt,
      schema: pass1Spec.schema,
      images: req.images,
      temperature: 0.0,
      thinkingBudget: pass1Budget,
      questionType: req.questionType,
      passLabel: 'Agent 1',
      onStage: onStage,
    );

    final parsed1 = pass1Call.parsed;
    final model1 = pass1Call.modelUsed;
    final ans1 = GeminiClient.normAns(req.questionType, parsed1);
    if (ans1.isEmpty) {
      throw Exception('Không trích xuất được đáp án hợp lệ từ Agent 1');
    }

    final step1 = (parsed1['step'] ?? parsed1['stepByStep'] ?? '').toString().trim();
    final selfCheck1 = (parsed1['selfCheck'] ?? '').toString().trim();
    final subject1 = (parsed1['subject'] ?? 'Tổng hợp').toString().trim();
    final conf1 = _clampConfidence(parsed1['confidence'], fallback: 88);
    final kind1 = req.questionType == 'SHORT_ANSWER'
        ? GeminiClient.normalizeShortAnswer(parsed1['shortAnswer'], parsed1['answerKind']?.toString()).kind
        : null;

    final consistency = ConsistencyChecker.check(
      questionType: req.questionType,
      normalizedAns: ans1,
      step: step1,
      selfCheck: selfCheck1,
      hasInternalConflict: req.questionType == 'TRUE_FALSE' && GeminiClient.detectTFInternalConflict(parsed1),
    );

    var currentRes = SolverResult(
      normalizedAns: ans1,
      answerKind: kind1,
      subject: subject1.isEmpty ? 'Tổng hợp' : subject1,
      step: step1,
      selfCheck: selfCheck1,
      confidence: conf1,
      riskScore: risk.score,
      riskReasons: risk.reasons,
      hasUncertainty: consistency.hasUncertainty,
      internalMismatch: consistency.internalMismatch,
      verifiedTwoPass: false,
      verifiedThreeAgent: false,
      modelUsed: model1,
      pipelineLabel: 'Agent 1',
      rawAgent1Ans: ans1,
    );

    // =========================================================================
    // TẦNG 2: AGENT 2 — ADVERSARIAL AUDITOR (CROSS-MODEL PHẢN BIỆN ĐỘC LẬP)
    // =========================================================================
    final runAgent2 = shouldRunAgent2(
      mode: req.intelligenceMode,
      req: req,
      riskScore: risk.score,
      confidence: currentRes.confidence,
      hasUncertainty: currentRes.hasUncertainty,
      internalMismatch: currentRes.internalMismatch,
      ans1: ans1,
    );

    var agent2Ran = false;
    var ans2 = '';
    var step2 = '';
    var conf2 = currentRes.confidence;
    var model2 = '';

    if (runAgent2) {
      onStage?.call(
        PillVisualState.auditing,
        'Agent 2 đang phản biện (${currentRes.subject}, Risk ${risk.score})...',
      );
      try {
        final auditorModels = KeyPoolService.buildCrossModelOrder(kAuditorModels, model1);
        final pass2Spec = _buildAgent2Spec(req, currentRes);
        final pass2Call = await _callWithRotation(
          modelList: auditorModels,
          apiKeys: apiKeys,
          systemText:
              'Bạn là Giám khảo phản biện độc lập bậc cao (GDPT 2018). Hãy tự giải lại độc lập trong thought và soi kỹ 6 nhóm bẫy kinh điển rồi xác nhận hoặc sửa đáp án ngắn gọn.',
          prompt: pass2Spec.prompt,
          schema: pass2Spec.schema,
          images: req.images,
          temperature: 0.1,
          thinkingBudget: 3584,
          questionType: req.questionType,
          passLabel: 'Agent 2',
          onStage: onStage,
        );

        agent2Ran = true;
        final parsed2 = pass2Call.parsed;
        model2 = pass2Call.modelUsed;
        ans2 = GeminiClient.normAns(req.questionType, parsed2);
        step2 = (parsed2['step'] ?? '').toString().trim();
        final auditNote = (parsed2['auditNote'] ?? '').toString().trim();
        conf2 = _clampConfidence(parsed2['finalConfidence'], fallback: currentRes.confidence);
        final verdict2 = (parsed2['verdict'] ?? '').toString().toUpperCase();

        final shouldOverride = ans2.isNotEmpty &&
            !req.rejectedAnswers.contains(ans2) &&
            ((verdict2 == 'CORRECT' && ans2 != ans1) || (req.rejectedAnswers.contains(ans1) && ans2 != ans1));

        currentRes = currentRes.copyWith(
          verifiedTwoPass: true,
          auditNote: auditNote,
          rawAgent2Ans: ans2.isNotEmpty ? ans2 : ans1,
          pipelineLabel: 'Agent 1 -> Agent 2 ✔',
          modelUsed: model2 != model1 ? '$model1 -> $model2' : model1,
          confidence: shouldOverride ? conf2 : ((currentRes.confidence + conf2) / 2).round(),
        );

        if (shouldOverride) {
          final kind2 = req.questionType == 'SHORT_ANSWER'
              ? GeminiClient.normalizeShortAnswer(
                  parsed2['finalShortAnswer'],
                  parsed2['answerKind']?.toString(),
                ).kind
              : currentRes.answerKind;
          currentRes = currentRes.copyWith(
            normalizedAns: ans2,
            answerKind: kind2,
            step: '[Phản biện Agent 2 ($model2) sửa "$ans1" -> "$ans2"]\n${step2.isNotEmpty ? step2 : currentRes.step}',
          );
        }
      } catch (auditErr) {
        currentRes = currentRes.copyWith(
          auditNote: 'Agent 2 bỏ qua do lỗi tạm thời: $auditErr',
        );
      }
    }

    // =========================================================================
    // TẦNG 3: AGENT 3 — TIE-BREAKER TRỌNG TÀI (KHI AGENT 1 & AGENT 2 BẤT ĐỒNG)
    // =========================================================================
    final runAgent3 = shouldRunAgent3(
      mode: req.intelligenceMode,
      agent2Ran: agent2Ran,
      ans1: ans1,
      ans2: ans2,
      conf2: conf2,
    );

    if (runAgent3) {
      onStage?.call(
        PillVisualState.tieBreaking,
        'Agent 3 Trọng tài đang phân xử ($ans1 vs $ans2)...',
      );
      try {
        final tieModels = KeyPoolService.buildCrossModelOrder(
          kAuditorModels,
          model2.isNotEmpty ? model2 : model1,
        );
        final pass3Spec = _buildAgent3Spec(
          req: req,
          ans1: ans1,
          step1: step1,
          model1: model1,
          ans2: ans2,
          step2: step2,
          auditNote: currentRes.auditNote,
          model2: model2,
        );
        final pass3Call = await _callWithRotation(
          modelList: tieModels,
          apiKeys: apiKeys,
          systemText:
              'Bạn là CHỦ TỊCH HỘI ĐỒNG TRỌNG TÀI (GDPT 2018). Hai giám khảo trước đang bất đồng đáp án. Hãy đọc kỹ đề, soi cả hai lập luận để ra phán quyết chính xác tuyệt đối.',
          prompt: pass3Spec.prompt,
          schema: pass3Spec.schema,
          images: req.images,
          temperature: 0.0,
          thinkingBudget: 4096,
          questionType: req.questionType,
          passLabel: 'Agent 3 Trọng tài',
          onStage: onStage,
        );

        final parsed3 = pass3Call.parsed;
        final model3 = pass3Call.modelUsed;
        final ans3 = GeminiClient.normAns(req.questionType, parsed3);
        final finalConf3 = _clampConfidence(parsed3['finalConfidence'], fallback: 92);
        final reason3 = (parsed3['finalVerdictReason'] ?? parsed3['step'] ?? '').toString().trim();
        final winner = (parsed3['chosenAgent'] ?? '').toString().trim();

        if (ans3.isNotEmpty && !req.rejectedAnswers.contains(ans3)) {
          final kind3 = req.questionType == 'SHORT_ANSWER'
              ? GeminiClient.normalizeShortAnswer(
                  parsed3['finalShortAnswer'],
                  parsed3['answerKind']?.toString(),
                ).kind
              : currentRes.answerKind;
          currentRes = currentRes.copyWith(
            normalizedAns: ans3,
            answerKind: kind3,
            confidence: finalConf3,
            verifiedTwoPass: true,
            verifiedThreeAgent: true,
            pipelineLabel: '3-Agent Trọng tài ✔',
            modelUsed: '$model1 -> $model2 -> $model3',
            auditNote: '[Trọng tài ($winner) chốt "$ans3" giữa "$ans1" và "$ans2"] $reason3',
            step: '[Trọng tài Agent 3 chốt "$ans3"]\n${reason3.isNotEmpty ? reason3 : currentRes.step}',
          );
        }
      } catch (tieErr) {
        currentRes = currentRes.copyWith(
          auditNote: '${currentRes.auditNote}\n(Agent 3 Trọng tài bỏ qua do lỗi: $tieErr)'.trim(),
        );
      }
    }

    _cache[cacheKey] = currentRes;
    return currentRes;
  }

  Future<({Map<String, dynamic> parsed, String modelUsed})> _callWithRotation({
    required List<String> modelList,
    required List<String> apiKeys,
    required String systemText,
    required String prompt,
    required Map<String, dynamic> schema,
    required List<VisualAttachment> images,
    required double temperature,
    required int thinkingBudget,
    required String questionType,
    required String passLabel,
    StageProgressCallback? onStage,
  }) async {
    Object? lastErr;
    for (final model in modelList) {
      for (var attempt = 0; attempt < apiKeys.length; attempt++) {
        final slot = keyPool.acquireBestKeyForModel(model, apiKeys);
        if (slot == null) break;
        if (slot.waitMs > 12000) break;

        if (slot.waitMs > 0) {
          onStage?.call(
            PillVisualState.scanning,
            '[$passLabel] Điều phối ${slot.maskedKey} (chờ ${(slot.waitMs / 1000).toStringAsFixed(1)}s)...',
          );
          await Future<void>.delayed(Duration(milliseconds: slot.waitMs));
        }

        try {
          final callRes = await client.generateStructured(
            model: model,
            apiKey: slot.apiKey,
            systemText: systemText,
            prompt: prompt,
            schema: schema,
            images: images,
            temperature: temperature,
            thinkingBudget: thinkingBudget,
            questionType: questionType,
          );
          await keyPool.markKeySuccess(slot.apiKey, model);
          return (parsed: callRes.parsed, modelUsed: model);
        } catch (err) {
          lastErr = err;
          final msg = err.toString();
          await keyPool.markKeyPenalty(slot.apiKey, model, msg);
          if (msg.contains('HTTP 404')) {
            break;
          }
        }
      }
    }
    throw Exception(lastErr?.toString() ?? 'Tất cả Model và API Key đều đang bận hoặc hết hạn mức');
  }

  static int _clampConfidence(dynamic raw, {int fallback = 88}) {
    final parsed = raw is num ? raw.toInt() : int.tryParse(raw?.toString() ?? '');
    if (parsed == null) return fallback;
    return parsed.clamp(0, 100);
  }

  static String _buildQuestionTextBlock(QuizSolveRequest q) {
    final blocks = <String>[];
    if (q.rejectedAnswers.isNotEmpty) {
      final joined = q.rejectedAnswers.map((r) => '"$r"').join(', ');
      blocks.add(
        '[CẢNH BÁO BẮT BUỘC TRÁNH ĐÁP ÁN SAI]: Các đáp án sau ĐÃ SAI ở lần thử trước: $joined. Hãy giải lại từ đầu và TUYỆT ĐỐI KHÔNG chọn lại các đáp án này.',
      );
    }
    if (q.contextPassage.trim().isNotEmpty) {
      blocks.add('--- ĐOẠN VĂN / NGỮ CẢNH CHUNG ---\n${q.contextPassage.trim()}');
    }
    blocks.add(
      '--- NỘI DUNG CÂU HỎI ---\n${q.rawScreenText.trim().isNotEmpty ? q.rawScreenText.trim() : "(Xem trong ảnh đính kèm)"}',
    );
    if (q.extraDetails.trim().isNotEmpty) {
      blocks.add(q.extraDetails.trim());
    }
    return blocks.join('\n\n');
  }

  static ({String prompt, Map<String, dynamic> schema}) _buildPass1Spec(QuizSolveRequest q) {
    final qBlock = _buildQuestionTextBlock(q);

    if (q.questionType == 'SHORT_ANSWER') {
      return (
        prompt: '''
Giải câu hỏi TRẢ LỜI NGẮN sau (nháp kỹ trong thought, tóm tắt ngắn 2-3 câu vào "step"):
- "subject": tên môn học.
- "step": công thức, phép tính chính, đơn vị và kiểm tra làm tròn (tối đa 90 từ).
- "selfCheck": 1 câu tự đối chiếu đáp án với đề bài.
- "answerKind": "NUMBER" nếu là số, "TEXT" nếu là từ/cụm từ.
- "shortAnswer": CHỈ ghi duy nhất kết quả cuối cùng (số dùng dấu ',', không đơn vị; chữ giữ nguyên khoảng trắng).
- "confidence": độ tin cậy (0-100).

$qBlock''',
        schema: {
          'type': 'OBJECT',
          'properties': {
            'subject': {'type': 'STRING'},
            'step': {'type': 'STRING'},
            'selfCheck': {'type': 'STRING'},
            'answerKind': {
              'type': 'STRING',
              'enum': ['NUMBER', 'TEXT'],
            },
            'shortAnswer': {'type': 'STRING'},
            'confidence': {'type': 'INTEGER'},
          },
          'required': ['subject', 'step', 'selfCheck', 'answerKind', 'shortAnswer', 'confidence'],
        },
      );
    }

    if (q.questionType == 'TRUE_FALSE') {
      return (
        prompt: '''
Giải câu hỏi ĐÚNG / SAI gồm 4 mệnh đề a, b, c, d sau (tính & soi bẫy từng ý trong thought, tóm tắt gọn vào "step"):
- "subject": tên môn học.
- "step": nêu ngắn gọn lý do Đúng/Sai của từng ý a, b, c, d (tối đa 90 từ).
- "selfCheck": 1 câu tự rà soát lại thứ tự 4 ý a, b, c, d.
- "trueFalseList": mảng ĐÚNG 4 giá trị boolean [ý a, ý b, ý c, ý d].
- "confidence": độ tin cậy (0-100).

$qBlock''',
        schema: {
          'type': 'OBJECT',
          'properties': {
            'subject': {'type': 'STRING'},
            'step': {'type': 'STRING'},
            'selfCheck': {'type': 'STRING'},
            'trueFalseList': {
              'type': 'ARRAY',
              'items': {'type': 'BOOLEAN'},
            },
            'confidence': {'type': 'INTEGER'},
          },
          'required': ['subject', 'step', 'selfCheck', 'trueFalseList', 'confidence'],
        },
      );
    }

    return (
      prompt: '''
Giải câu hỏi TRẮC NGHIỆM 4 lựa chọn A, B, C, D sau (kiểm tra cực tính ĐÚNG/SAI, CLOSEST/OPPOSITE và xét cả 4 đáp án trong thought, tóm tắt gọn vào "step"):
- "subject": tên môn học.
- "step": tóm tắt ngắn gọn lập luận/phép tính và lý do loại trừ (tối đa 90 từ).
- "selfCheck": 1 câu tự đối chiếu đáp án chọn với yêu cầu đề.
- "mcqAnswer": chữ cái đúng nhất ("A", "B", "C" hoặc "D").
- "confidence": độ tin cậy (0-100).

$qBlock''',
      schema: {
        'type': 'OBJECT',
        'properties': {
          'subject': {'type': 'STRING'},
          'step': {'type': 'STRING'},
          'selfCheck': {'type': 'STRING'},
          'mcqAnswer': {
            'type': 'STRING',
            'enum': ['A', 'B', 'C', 'D'],
          },
          'confidence': {'type': 'INTEGER'},
        },
        'required': ['subject', 'step', 'selfCheck', 'mcqAnswer', 'confidence'],
      },
    );
  }

  static ({String prompt, Map<String, dynamic> schema}) _buildAgent2Spec(
    QuizSolveRequest q,
    SolverResult pass1Res,
  ) {
    final qBlock = _buildQuestionTextBlock(q);
    final proposal = '''
--- ĐÁP ÁN AGENT 1 ĐỀ XUẤT CẦN THẨM ĐỊNH ---
Đáp án đề xuất: ${pass1Res.normalizedAns}
Lập luận Agent 1: ${pass1Res.step}
Cảnh báo nội bộ: ${pass1Res.internalMismatch ? "CÓ MÂU THUẪN NỘI BỘ" : (pass1Res.hasUncertainty ? "Có dấu hiệu phân vân" : "Không")}''';

    const auditGuide = '''
Hãy tự giải lại độc lập trong phần thought và soi 6 nhóm bẫy kinh điển:
1. Ngược yêu cầu ĐÚNG vs SAI/KHÔNG/NGOẠI TRỪ, CLOSEST vs OPPOSITE.
2. Lỗi dấu, góc vectơ (vec(AB).vec(BC) = -AB.BC.cosB), thiếu ĐKXĐ, độ dịch chuyển vs quãng đường, hypebol 2a/2c.
3. Đổi đơn vị SI (km/h->m/s, cm->m), làm tròn, 1 KB = 1024 B, Python range(a,b), 24,79 L/mol.
4. Phát âm IPA / trọng âm [GẠCH_CHÂN: ...] và bằng chứng trực tiếp trong đoạn văn đọc hiểu.
5. Lỗi nhầm thứ tự 4 ý a, b, c, d trong câu Đúng/Sai.
6. Đọc lại số liệu trực tiếp trên hình ảnh / đồ thị / bảng biến thiên nếu có đính kèm.
Nếu đúng hoàn toàn -> verdict="CONFIRM"; nếu phát hiện sai hoặc vi phạm danh sách bị loại -> verdict="CORRECT" và sửa lại đáp án chuẩn xác. Viết "step" và "auditNote" ngắn gọn (tối đa 80 từ).''';

    if (q.questionType == 'SHORT_ANSWER') {
      return (
        prompt: '$auditGuide\n\n$qBlock\n\n$proposal',
        schema: {
          'type': 'OBJECT',
          'properties': {
            'step': {'type': 'STRING'},
            'verdict': {
              'type': 'STRING',
              'enum': ['CONFIRM', 'CORRECT'],
            },
            'answerKind': {
              'type': 'STRING',
              'enum': ['NUMBER', 'TEXT'],
            },
            'auditNote': {'type': 'STRING'},
            'finalShortAnswer': {'type': 'STRING'},
            'finalConfidence': {'type': 'INTEGER'},
          },
          'required': ['step', 'verdict', 'answerKind', 'auditNote', 'finalShortAnswer', 'finalConfidence'],
        },
      );
    }

    if (q.questionType == 'TRUE_FALSE') {
      return (
        prompt: '$auditGuide\n\n$qBlock\n\n$proposal',
        schema: {
          'type': 'OBJECT',
          'properties': {
            'step': {'type': 'STRING'},
            'verdict': {
              'type': 'STRING',
              'enum': ['CONFIRM', 'CORRECT'],
            },
            'auditNote': {'type': 'STRING'},
            'finalTrueFalseList': {
              'type': 'ARRAY',
              'items': {'type': 'BOOLEAN'},
            },
            'finalConfidence': {'type': 'INTEGER'},
          },
          'required': ['step', 'verdict', 'auditNote', 'finalTrueFalseList', 'finalConfidence'],
        },
      );
    }

    return (
      prompt: '$auditGuide\n\n$qBlock\n\n$proposal',
      schema: {
        'type': 'OBJECT',
        'properties': {
          'step': {'type': 'STRING'},
          'verdict': {
            'type': 'STRING',
            'enum': ['CONFIRM', 'CORRECT'],
          },
          'auditNote': {'type': 'STRING'},
          'finalMcqAnswer': {
            'type': 'STRING',
            'enum': ['A', 'B', 'C', 'D'],
          },
          'finalConfidence': {'type': 'INTEGER'},
        },
        'required': ['step', 'verdict', 'auditNote', 'finalMcqAnswer', 'finalConfidence'],
      },
    );
  }

  static ({String prompt, Map<String, dynamic> schema}) _buildAgent3Spec({
    required QuizSolveRequest req,
    required String ans1,
    required String step1,
    required String model1,
    required String ans2,
    required String step2,
    required String auditNote,
    required String model2,
  }) {
    final qBlock = _buildQuestionTextBlock(req);
    final clashBlock = '''
--- HAI LUỒNG LẬP LUẬN ĐANG BẤT ĐỒNG ---
[AGENT 1 ($model1)] -> Đáp án: $ans1
Lập luận: $step1

[AGENT 2 ($model2)] -> Đáp án: $ans2
Phản biện: $auditNote | $step2

Hãy kiểm chứng lại từ gốc trên đề bài (và ảnh nếu có), chỉ ra ai mắc bẫy và chốt kết quả đúng duy nhất.''';

    if (req.questionType == 'SHORT_ANSWER') {
      return (
        prompt: '$qBlock\n\n$clashBlock',
        schema: {
          'type': 'OBJECT',
          'properties': {
            'chosenAgent': {
              'type': 'STRING',
              'enum': ['AGENT_1', 'AGENT_2', 'NEW'],
            },
            'finalVerdictReason': {'type': 'STRING'},
            'answerKind': {
              'type': 'STRING',
              'enum': ['NUMBER', 'TEXT'],
            },
            'finalShortAnswer': {'type': 'STRING'},
            'finalConfidence': {'type': 'INTEGER'},
          },
          'required': [
            'chosenAgent',
            'finalVerdictReason',
            'answerKind',
            'finalShortAnswer',
            'finalConfidence',
          ],
        },
      );
    }

    if (req.questionType == 'TRUE_FALSE') {
      return (
        prompt: '$qBlock\n\n$clashBlock',
        schema: {
          'type': 'OBJECT',
          'properties': {
            'chosenAgent': {
              'type': 'STRING',
              'enum': ['AGENT_1', 'AGENT_2', 'NEW'],
            },
            'finalVerdictReason': {'type': 'STRING'},
            'finalTrueFalseList': {
              'type': 'ARRAY',
              'items': {'type': 'BOOLEAN'},
            },
            'finalConfidence': {'type': 'INTEGER'},
          },
          'required': [
            'chosenAgent',
            'finalVerdictReason',
            'finalTrueFalseList',
            'finalConfidence',
          ],
        },
      );
    }

    return (
      prompt: '$qBlock\n\n$clashBlock',
      schema: {
        'type': 'OBJECT',
        'properties': {
          'chosenAgent': {
            'type': 'STRING',
            'enum': ['AGENT_1', 'AGENT_2', 'NEW'],
          },
          'finalVerdictReason': {'type': 'STRING'},
          'finalMcqAnswer': {
            'type': 'STRING',
            'enum': ['A', 'B', 'C', 'D'],
          },
          'finalConfidence': {'type': 'INTEGER'},
        },
        'required': [
          'chosenAgent',
          'finalVerdictReason',
          'finalMcqAnswer',
          'finalConfidence',
        ],
      },
    );
  }
}
