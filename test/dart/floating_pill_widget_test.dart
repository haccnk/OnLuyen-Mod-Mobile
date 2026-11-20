import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onluyen_mod_mobile/controllers/solver_controller.dart';
import 'package:onluyen_mod_mobile/services/storage_service.dart';
import 'package:onluyen_mod_mobile/ui/widgets/floating_solver_pill.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('FloatingSolverPill renders directly inside Stack without StackParentData error', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final storage = StorageService();
    final controller = SolverController(storage: storage);
    await controller.init();

    var tapped = false;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Stack(
            children: [
              const SizedBox.expand(),
              FloatingSolverPill(
                controller: controller,
                visible: true,
                onTap: () => tapped = true,
              ),
            ],
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.byIcon(Icons.tune_rounded), findsOneWidget);

    await tester.tap(find.byIcon(Icons.tune_rounded));
    await tester.pump();
    expect(tapped, isTrue);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Stack(
            children: [
              const SizedBox.expand(),
              FloatingSolverPill(
                controller: controller,
                visible: false,
                onTap: () {},
              ),
            ],
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
  });
}
