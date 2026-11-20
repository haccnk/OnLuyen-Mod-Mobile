class QuizHistoryItem {
  final String signature;
  final String qLabel;
  final String question;
  final String answer;
  final String step;
  final String subject;
  final int confidence;
  final bool verifiedTwoPass;
  final bool verifiedThreeAgent;
  final String auditNote;
  final String modelUsed;
  final int timestampMs;

  const QuizHistoryItem({
    required this.signature,
    required this.qLabel,
    required this.question,
    required this.answer,
    this.step = '',
    this.subject = '',
    this.confidence = 90,
    this.verifiedTwoPass = false,
    this.verifiedThreeAgent = false,
    this.auditNote = '',
    this.modelUsed = '',
    required this.timestampMs,
  });

  Map<String, dynamic> toJson() => {
        'signature': signature,
        'qLabel': qLabel,
        'question': question,
        'answer': answer,
        'step': step,
        'subject': subject,
        'confidence': confidence,
        'verifiedTwoPass': verifiedTwoPass,
        'verifiedThreeAgent': verifiedThreeAgent,
        'auditNote': auditNote,
        'modelUsed': modelUsed,
        'timestampMs': timestampMs,
      };

  factory QuizHistoryItem.fromJson(Map<String, dynamic> json) {
    return QuizHistoryItem(
      signature: (json['signature'] ?? '').toString(),
      qLabel: (json['qLabel'] ?? '').toString(),
      question: (json['question'] ?? '').toString(),
      answer: (json['answer'] ?? '').toString(),
      step: (json['step'] ?? '').toString(),
      subject: (json['subject'] ?? '').toString(),
      confidence: json['confidence'] is num ? (json['confidence'] as num).toInt() : 90,
      verifiedTwoPass: json['verifiedTwoPass'] == true,
      verifiedThreeAgent: json['verifiedThreeAgent'] == true,
      auditNote: (json['auditNote'] ?? '').toString(),
      modelUsed: (json['modelUsed'] ?? '').toString(),
      timestampMs: json['timestampMs'] is num
          ? (json['timestampMs'] as num).toInt()
          : DateTime.now().millisecondsSinceEpoch,
    );
  }
}
