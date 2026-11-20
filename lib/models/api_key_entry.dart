enum ApiKeyStatus {
  untested,
  alive,
  rateLimited,
  error,
}

class ModelLiveStatus {
  final ApiKeyStatus status;
  final int? latencyMs;
  final String message;

  const ModelLiveStatus({
    required this.status,
    this.latencyMs,
    this.message = '',
  });

  Map<String, dynamic> toJson() => {
        'status': status.name,
        'latencyMs': latencyMs,
        'message': message,
      };

  factory ModelLiveStatus.fromJson(Map<String, dynamic> json) {
    final rawStatus = (json['status'] ?? 'untested').toString();
    final status = ApiKeyStatus.values.firstWhere(
      (e) => e.name == rawStatus,
      orElse: () => ApiKeyStatus.untested,
    );
    return ModelLiveStatus(
      status: status,
      latencyMs: json['latencyMs'] is num ? (json['latencyMs'] as num).toInt() : null,
      message: (json['message'] ?? '').toString(),
    );
  }
}

class ApiKeyEntry {
  final String id;
  final String label;
  final String key;
  final bool enabled;
  final ApiKeyStatus status;
  final int? latencyMs;
  final String statusDetail;
  final Map<String, ModelLiveStatus> modelStatuses;

  const ApiKeyEntry({
    required this.id,
    required this.label,
    required this.key,
    this.enabled = true,
    this.status = ApiKeyStatus.untested,
    this.latencyMs,
    this.statusDetail = '',
    this.modelStatuses = const {},
  });

  String get maskedKey {
    final k = key.trim();
    if (k.length <= 10) return '***';
    return '${k.substring(0, 6)}...${k.substring(k.length - 4)}';
  }

  ApiKeyEntry copyWith({
    String? id,
    String? label,
    String? key,
    bool? enabled,
    ApiKeyStatus? status,
    int? latencyMs,
    bool clearLatency = false,
    String? statusDetail,
    Map<String, ModelLiveStatus>? modelStatuses,
  }) {
    return ApiKeyEntry(
      id: id ?? this.id,
      label: label ?? this.label,
      key: key ?? this.key,
      enabled: enabled ?? this.enabled,
      status: status ?? this.status,
      latencyMs: clearLatency ? null : (latencyMs ?? this.latencyMs),
      statusDetail: statusDetail ?? this.statusDetail,
      modelStatuses: modelStatuses ?? this.modelStatuses,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'key': key,
        'enabled': enabled,
        'status': status.name,
        'latencyMs': latencyMs,
        'statusDetail': statusDetail,
        'modelStatuses': modelStatuses.map((k, v) => MapEntry(k, v.toJson())),
      };

  factory ApiKeyEntry.fromJson(Map<String, dynamic> json) {
    final rawStatus = (json['status'] ?? 'untested').toString();
    final status = ApiKeyStatus.values.firstWhere(
      (e) => e.name == rawStatus,
      orElse: () => ApiKeyStatus.untested,
    );
    final rawModels = json['modelStatuses'];
    final parsedModels = <String, ModelLiveStatus>{};
    if (rawModels is Map) {
      for (final entry in rawModels.entries) {
        if (entry.value is Map) {
          parsedModels[entry.key.toString()] = ModelLiveStatus.fromJson(
            Map<String, dynamic>.from(entry.value as Map),
          );
        }
      }
    }
    return ApiKeyEntry(
      id: (json['id'] ?? '').toString(),
      label: (json['label'] ?? 'API Key').toString(),
      key: (json['key'] ?? '').toString(),
      enabled: json['enabled'] != false,
      status: status,
      latencyMs: json['latencyMs'] is num ? (json['latencyMs'] as num).toInt() : null,
      statusDetail: (json['statusDetail'] ?? '').toString(),
      modelStatuses: parsedModels,
    );
  }
}
