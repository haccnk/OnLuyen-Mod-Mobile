import 'package:flutter/material.dart';

import '../../controllers/solver_controller.dart';
import '../../models/api_key_entry.dart';
import '../../services/gemini_client.dart';
import '../theme/app_theme.dart';

class ApiKeySettingsScreen extends StatefulWidget {
  final SolverController controller;

  const ApiKeySettingsScreen({super.key, required this.controller});

  @override
  State<ApiKeySettingsScreen> createState() => _ApiKeySettingsScreenState();
}

class _ApiKeySettingsScreenState extends State<ApiKeySettingsScreen> {
  final TextEditingController _labelCtrl = TextEditingController();
  final TextEditingController _keysCtrl = TextEditingController();
  bool _obscureInput = true;

  @override
  void dispose() {
    _labelCtrl.dispose();
    _keysCtrl.dispose();
    super.dispose();
  }

  Future<void> _onAddKeys() async {
    final raw = _keysCtrl.text.trim();
    if (raw.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng dán ít nhất 1 Gemini API Key.')),
      );
      return;
    }

    final added = await widget.controller.addApiKeys(
      rawKeysInput: raw,
      labelPrefix: _labelCtrl.text,
    );
    if (!mounted) return;

    if (added > 0) {
      _keysCtrl.clear();
      _labelCtrl.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Đã thêm $added API Key vào danh sách xoay vòng.')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Các Key vừa nhập đã tồn tại trong danh sách.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cài đặt Đa API Key', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            tooltip: 'Xóa cache cooldown 429',
            onPressed: () async {
              await widget.controller.clearCooldowns();
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Đã xóa toàn bộ cache cooldown và bộ nhớ tạm.')),
              );
            },
            icon: const Icon(Icons.cleaning_services_rounded, color: AppTheme.amberWarn),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: widget.controller,
        builder: (context, _) {
          final keys = widget.controller.apiKeys;
          final isTesting = widget.controller.isTestingKeys;

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildInfoCard(),
              const SizedBox(height: 14),
              _buildAddKeyCard(),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.skyAccent,
                        foregroundColor: AppTheme.bgDeep,
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: (keys.isEmpty || isTesting)
                          ? null
                          : () => widget.controller.testAllKeysLive(),
                      icon: isTesting
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.bgDeep),
                            )
                          : const Icon(Icons.bolt_rounded, size: 20),
                      label: Text(
                        isTesting
                            ? 'Đang kiểm tra Live...'
                            : '⚡ Kiểm tra tất cả Key (Test Live)',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Danh sách Key (${keys.length})',
                    style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    '${widget.controller.enabledKeyStrings.length} đang bật',
                    style: const TextStyle(color: AppTheme.emeraldSolved, fontSize: 12.5),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              if (keys.isEmpty)
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: AppTheme.bgCard,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.borderSubtle),
                  ),
                  child: const Column(
                    children: [
                      Icon(Icons.key_off_rounded, color: AppTheme.amberWarn, size: 34),
                      SizedBox(height: 8),
                      Text(
                        'Chưa có API Key nào được lưu.\nDán Gemini API Key ở khung phía trên để bắt đầu.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.4),
                      ),
                    ],
                  ),
                )
              else
                ...keys.map((entry) => _buildKeyCard(entry, isTesting)),
            ],
          );
        },
      ),
    );
  }

  Widget _buildInfoCard() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.withAlphaHex(AppTheme.skyAccent, 22),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.withAlphaHex(AppTheme.skyAccent, 90)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.shield_outlined, color: AppTheme.skyAccent, size: 20),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Toàn bộ API Key chỉ lưu cục bộ trong máy bạn. App tự xoay vòng tròn các Key đang bật trên gemini-3.1-flash-lite & gemini-3-flash-preview.',
              style: TextStyle(color: AppTheme.textPrimary, fontSize: 12.5, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAddKeyCard() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderSubtle),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Thêm Gemini API Key (1 hoặc nhiều dòng)',
            style: TextStyle(color: AppTheme.textPrimary, fontSize: 14, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _labelCtrl,
            style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13),
            decoration: const InputDecoration(
              labelText: 'Nhãn gợi nhớ (tuỳ chọn)',
              hintText: 'VD: Gmail cá nhân, Tài khoản phụ...',
              isDense: true,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _keysCtrl,
            obscureText: _obscureInput,
            maxLines: _obscureInput ? 1 : 4,
            minLines: 1,
            style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13),
            decoration: InputDecoration(
              labelText: 'Dán API Key tại đây (ngăn cách bằng xuống dòng hoặc dấu phẩy)',
              hintText: 'Dán 1 hoặc nhiều key...',
              suffixIcon: IconButton(
                onPressed: () => setState(() => _obscureInput = !_obscureInput),
                icon: Icon(
                  _obscureInput ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  color: AppTheme.textSecondary,
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppTheme.emeraldSolved,
              foregroundColor: AppTheme.bgDeep,
              padding: const EdgeInsets.symmetric(vertical: 11),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: _onAddKeys,
            icon: const Icon(Icons.add_circle_outline_rounded, size: 19),
            label: const Text('Thêm vào bộ xoay vòng', style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }

  Widget _buildKeyCard(ApiKeyEntry entry, bool isTesting) {
    final badge = _statusBadge(entry);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: entry.enabled ? AppTheme.borderSubtle : AppTheme.withAlphaHex(AppTheme.slateMuted, 90),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.label,
                      style: TextStyle(
                        color: entry.enabled ? AppTheme.textPrimary : AppTheme.textSecondary,
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      entry.maskedKey,
                      style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12, fontFamily: 'monospace'),
                    ),
                  ],
                ),
              ),
              badge,
              const SizedBox(width: 6),
              Switch(
                value: entry.enabled,
                activeThumbColor: AppTheme.emeraldSolved,
                onChanged: (_) => widget.controller.toggleApiKey(entry.id),
              ),
            ],
          ),
          if (entry.modelStatuses.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: GeminiClient.liveTestModels.map((model) {
                final st = entry.modelStatuses[model];
                if (st == null) return const SizedBox.shrink();
                final col = st.status == ApiKeyStatus.alive
                    ? AppTheme.emeraldSolved
                    : (st.status == ApiKeyStatus.rateLimited ? AppTheme.amberWarn : AppTheme.crimsonErr);
                final shortName = model.replaceFirst('gemini-', '');
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.withAlphaHex(col, 24),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: AppTheme.withAlphaHex(col, 90)),
                  ),
                  child: Text(
                    '$shortName: ${st.message}',
                    style: TextStyle(color: col, fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                );
              }).toList(),
            ),
          ],
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton.icon(
                onPressed: isTesting ? null : () => widget.controller.testSingleKeyLive(entry.id),
                icon: const Icon(Icons.speed_rounded, size: 16),
                label: const Text('Test Live', style: TextStyle(fontSize: 12)),
              ),
              TextButton.icon(
                style: TextButton.styleFrom(foregroundColor: AppTheme.crimsonErr),
                onPressed: () => widget.controller.deleteApiKey(entry.id),
                icon: const Icon(Icons.delete_outline_rounded, size: 16),
                label: const Text('Xóa', style: TextStyle(fontSize: 12)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statusBadge(ApiKeyEntry entry) {
    final String iconDot;
    final String label;
    final Color color;

    switch (entry.status) {
      case ApiKeyStatus.alive:
        iconDot = '🟢';
        label = entry.latencyMs != null ? 'Sống (${entry.latencyMs}ms)' : 'Sống';
        color = AppTheme.emeraldSolved;
        break;
      case ApiKeyStatus.rateLimited:
        iconDot = '🟡';
        label = 'Hết lượt (429)';
        color = AppTheme.amberWarn;
        break;
      case ApiKeyStatus.error:
        iconDot = '🔴';
        label = entry.statusDetail.isNotEmpty ? entry.statusDetail : 'Lỗi';
        color = AppTheme.crimsonErr;
        break;
      case ApiKeyStatus.untested:
        iconDot = '⚪';
        label = 'Chưa test';
        color = AppTheme.textSecondary;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.withAlphaHex(color, 28),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.withAlphaHex(color, 110)),
      ),
      child: Text(
        '$iconDot $label',
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}
