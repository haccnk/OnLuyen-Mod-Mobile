enum IntelligenceMode {
  fast,
  smart,
  ultra,
}

extension IntelligenceModeX on IntelligenceMode {
  String get apiName => name;

  String get displayName {
    switch (this) {
      case IntelligenceMode.fast:
        return 'Fast';
      case IntelligenceMode.smart:
        return 'Smart';
      case IntelligenceMode.ultra:
        return 'Ultra';
    }
  }

  static IntelligenceMode fromString(String? value) {
    return IntelligenceMode.values.firstWhere(
      (m) => m.name == value,
      orElse: () => IntelligenceMode.smart,
    );
  }
}

enum PillVisualState {
  noKey,
  paused,
  idle,
  scanning,
  auditing,
  tieBreaking,
  solved,
  error,
}

class VisualAttachment {
  final String label;
  final String mimeType;
  final String base64Data;

  const VisualAttachment({
    required this.label,
    required this.mimeType,
    required this.base64Data,
  });

  factory VisualAttachment.fromJson(Map<String, dynamic> json) {
    return VisualAttachment(
      label: (json['label'] ?? '[Hình ảnh]').toString(),
      mimeType: (json['mimeType'] ?? 'image/jpeg').toString(),
      base64Data: (json['data'] ?? json['base64Data'] ?? '').toString(),
    );
  }
}

class QuizSolveRequest {
  final String questionType;
  final String qCode;
  final String rawScreenText;
  final String contextPassage;
  final String extraDetails;
  final bool hasVisuals;
  final bool hasUnderline;
  final bool hasTable;
  final String visualSignature;
  final List<VisualAttachment> images;
  final IntelligenceMode intelligenceMode;
  final bool isManualRetry;
  final List<String> rejectedAnswers;

  const QuizSolveRequest({
    required this.questionType,
    required this.qCode,
    required this.rawScreenText,
    this.contextPassage = '',
    this.extraDetails = '',
    this.hasVisuals = false,
    this.hasUnderline = false,
    this.hasTable = false,
    this.visualSignature = '',
    this.images = const [],
    this.intelligenceMode = IntelligenceMode.smart,
    this.isManualRetry = false,
    this.rejectedAnswers = const [],
  });

  factory QuizSolveRequest.fromJson(Map<String, dynamic> json) {
    final rawImgs = json['images'];
    final parsedImages = <VisualAttachment>[];
    if (rawImgs is List) {
      for (final item in rawImgs) {
        if (item is Map) {
          final att = VisualAttachment.fromJson(Map<String, dynamic>.from(item));
          if (att.base64Data.isNotEmpty) parsedImages.add(att);
        }
      }
    }
    final rawRej = json['rejectedAnswers'];
    final rejected = <String>[];
    if (rawRej is List) {
      for (final item in rawRej) {
        final s = item?.toString().trim() ?? '';
        if (s.isNotEmpty && !rejected.contains(s)) rejected.add(s);
      }
    }
    return QuizSolveRequest(
      questionType: (json['questionType'] ?? 'MCQ').toString(),
      qCode: (json['qCode'] ?? 'Câu hỏi').toString(),
      rawScreenText: (json['rawScreenText'] ?? '').toString(),
      contextPassage: (json['contextPassage'] ?? '').toString(),
      extraDetails: (json['extraDetails'] ?? '').toString(),
      hasVisuals: json['hasVisuals'] == true || parsedImages.isNotEmpty,
      hasUnderline: json['hasUnderline'] == true,
      hasTable: json['hasTable'] == true,
      visualSignature: (json['visualSignature'] ?? '').toString(),
      images: parsedImages,
      intelligenceMode: IntelligenceModeX.fromString(json['intelligenceMode']?.toString()),
      isManualRetry: json['isManualRetry'] == true,
      rejectedAnswers: rejected,
    );
  }
}

class SolverResult {
  final String normalizedAns;
  final String? answerKind;
  final String subject;
  final String step;
  final String selfCheck;
  final String auditNote;
  final int confidence;
  final int riskScore;
  final List<String> riskReasons;
  final bool hasUncertainty;
  final bool internalMismatch;
  final bool verifiedTwoPass;
  final bool verifiedThreeAgent;
  final String modelUsed;
  final String pipelineLabel;
  final String rawAgent1Ans;
  final String rawAgent2Ans;

  const SolverResult({
    required this.normalizedAns,
    this.answerKind,
    this.subject = 'Tổng hợp',
    this.step = '',
    this.selfCheck = '',
    this.auditNote = '',
    this.confidence = 90,
    this.riskScore = 0,
    this.riskReasons = const [],
    this.hasUncertainty = false,
    this.internalMismatch = false,
    this.verifiedTwoPass = false,
    this.verifiedThreeAgent = false,
    this.modelUsed = '',
    this.pipelineLabel = 'Agent 1',
    this.rawAgent1Ans = '',
    this.rawAgent2Ans = '',
  });

  SolverResult copyWith({
    String? normalizedAns,
    String? answerKind,
    String? subject,
    String? step,
    String? selfCheck,
    String? auditNote,
    int? confidence,
    int? riskScore,
    List<String>? riskReasons,
    bool? hasUncertainty,
    bool? internalMismatch,
    bool? verifiedTwoPass,
    bool? verifiedThreeAgent,
    String? modelUsed,
    String? pipelineLabel,
    String? rawAgent1Ans,
    String? rawAgent2Ans,
  }) {
    return SolverResult(
      normalizedAns: normalizedAns ?? this.normalizedAns,
      answerKind: answerKind ?? this.answerKind,
      subject: subject ?? this.subject,
      step: step ?? this.step,
      selfCheck: selfCheck ?? this.selfCheck,
      auditNote: auditNote ?? this.auditNote,
      confidence: confidence ?? this.confidence,
      riskScore: riskScore ?? this.riskScore,
      riskReasons: riskReasons ?? this.riskReasons,
      hasUncertainty: hasUncertainty ?? this.hasUncertainty,
      internalMismatch: internalMismatch ?? this.internalMismatch,
      verifiedTwoPass: verifiedTwoPass ?? this.verifiedTwoPass,
      verifiedThreeAgent: verifiedThreeAgent ?? this.verifiedThreeAgent,
      modelUsed: modelUsed ?? this.modelUsed,
      pipelineLabel: pipelineLabel ?? this.pipelineLabel,
      rawAgent1Ans: rawAgent1Ans ?? this.rawAgent1Ans,
      rawAgent2Ans: rawAgent2Ans ?? this.rawAgent2Ans,
    );
  }

  Map<String, dynamic> toJson() => {
        'normalizedAns': normalizedAns,
        'answerKind': answerKind,
        'subject': subject,
        'step': step,
        'selfCheck': selfCheck,
        'auditNote': auditNote,
        'confidence': confidence,
        'riskScore': riskScore,
        'riskReasons': riskReasons,
        'hasUncertainty': hasUncertainty,
        'internalMismatch': internalMismatch,
        'verifiedTwoPass': verifiedTwoPass,
        'verifiedThreeAgent': verifiedThreeAgent,
        'modelUsed': modelUsed,
        'pipelineLabel': pipelineLabel,
        'rawAgent1Ans': rawAgent1Ans,
        'rawAgent2Ans': rawAgent2Ans,
      };
}

class SolverMeta {
  final String qLabel;
  final String subject;
  final int confidence;
  final int riskScore;
  final bool verifiedTwoPass;
  final bool verifiedThreeAgent;
  final String pipelineLabel;
  final String step;
  final String selfCheck;
  final String auditNote;
  final String modelUsed;
  final String normalizedAns;

  const SolverMeta({
    required this.qLabel,
    this.subject = 'Tổng hợp',
    this.confidence = 90,
    this.riskScore = 0,
    this.verifiedTwoPass = false,
    this.verifiedThreeAgent = false,
    this.pipelineLabel = 'Agent 1',
    this.step = '',
    this.selfCheck = '',
    this.auditNote = '',
    this.modelUsed = '',
    this.normalizedAns = '',
  });

  factory SolverMeta.fromJson(Map<String, dynamic> json) {
    return SolverMeta(
      qLabel: (json['qLabel'] ?? '').toString(),
      subject: (json['subject'] ?? 'Tổng hợp').toString(),
      confidence: json['confidence'] is num ? (json['confidence'] as num).toInt() : 90,
      riskScore: json['riskScore'] is num ? (json['riskScore'] as num).toInt() : 0,
      verifiedTwoPass: json['verifiedTwoPass'] == true,
      verifiedThreeAgent: json['verifiedThreeAgent'] == true,
      pipelineLabel: (json['pipelineLabel'] ?? 'Agent 1').toString(),
      step: (json['step'] ?? '').toString(),
      selfCheck: (json['selfCheck'] ?? '').toString(),
      auditNote: (json['auditNote'] ?? '').toString(),
      modelUsed: (json['modelUsed'] ?? '').toString(),
      normalizedAns: (json['normalizedAns'] ?? '').toString(),
    );
  }
}

class SolverUiState {
  final bool enabled;
  final bool autoAdvance;
  final bool desktopMode;
  final IntelligenceMode mode;
  final PillVisualState pillState;
  final String statusText;
  final String lastAnswer;
  final SolverMeta? lastMeta;
  final int activeKeyCount;
  final bool hasKeys;

  const SolverUiState({
    this.enabled = true,
    this.autoAdvance = true,
    this.desktopMode = false,
    this.mode = IntelligenceMode.smart,
    this.pillState = PillVisualState.noKey,
    this.statusText = 'Chưa có API Key — chạm để cài đặt',
    this.lastAnswer = '',
    this.lastMeta,
    this.activeKeyCount = 0,
    this.hasKeys = false,
  });

  SolverUiState copyWith({
    bool? enabled,
    bool? autoAdvance,
    bool? desktopMode,
    IntelligenceMode? mode,
    PillVisualState? pillState,
    String? statusText,
    String? lastAnswer,
    SolverMeta? lastMeta,
    bool clearMeta = false,
    int? activeKeyCount,
    bool? hasKeys,
  }) {
    return SolverUiState(
      enabled: enabled ?? this.enabled,
      autoAdvance: autoAdvance ?? this.autoAdvance,
      desktopMode: desktopMode ?? this.desktopMode,
      mode: mode ?? this.mode,
      pillState: pillState ?? this.pillState,
      statusText: statusText ?? this.statusText,
      lastAnswer: lastAnswer ?? this.lastAnswer,
      lastMeta: clearMeta ? null : (lastMeta ?? this.lastMeta),
      activeKeyCount: activeKeyCount ?? this.activeKeyCount,
      hasKeys: hasKeys ?? this.hasKeys,
    );
  }
}
