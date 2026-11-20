import 'package:flutter/material.dart';

import 'controllers/solver_controller.dart';
import 'services/storage_service.dart';
import 'ui/screens/webview_mod_screen.dart';
import 'ui/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final storage = StorageService();
  final controller = SolverController(storage: storage);
  await controller.init();

  runApp(OnLuyenModApp(controller: controller));
}

class OnLuyenModApp extends StatelessWidget {
  final SolverController controller;

  const OnLuyenModApp({super.key, required this.controller});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OnLuyen Mod Mobile',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.buildDarkTheme(),
      home: WebViewModScreen(controller: controller),
    );
  }
}
