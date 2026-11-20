import 'package:flutter/material.dart';

class AppTheme {
  static const Color bgDeep = Color(0xFF0B1120);
  static const Color bgSurface = Color(0xFF111827);
  static const Color bgCard = Color(0xFF1E293B);
  static const Color bgCardSoft = Color(0xCC1E293B);
  static const Color borderSubtle = Color(0x3394A3B8);
  static const Color textPrimary = Color(0xFFF8FAFC);
  static const Color textSecondary = Color(0xFF94A3B8);

  static const Color skyAccent = Color(0xFF38BDF8);
  static const Color emeraldSolved = Color(0xFF10B981);
  static const Color violetAudit = Color(0xFF8B5CF6);
  static const Color amberWarn = Color(0xFFF59E0B);
  static const Color crimsonErr = Color(0xFFEF4444);
  static const Color slateMuted = Color(0xFF475569);

  static Color withAlphaHex(Color base, int alpha0to255) {
    return base.withAlpha(alpha0to255.clamp(0, 255));
  }

  static ThemeData buildDarkTheme() {
    const scheme = ColorScheme.dark(
      primary: skyAccent,
      secondary: violetAudit,
      surface: bgSurface,
      error: crimsonErr,
      onPrimary: bgDeep,
      onSecondary: textPrimary,
      onSurface: textPrimary,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      scaffoldBackgroundColor: bgDeep,
      appBarTheme: const AppBarTheme(
        backgroundColor: bgSurface,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: bgDeep,
        hintStyle: const TextStyle(color: textSecondary, fontSize: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: borderSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: borderSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: skyAccent, width: 1.5),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: bgCard,
        contentTextStyle: const TextStyle(color: textPrimary, fontSize: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
