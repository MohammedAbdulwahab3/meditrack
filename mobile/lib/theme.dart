import 'package:flutter/material.dart';

/// MediTrack design tokens.
abstract final class AppColors {
  static const brand = Color(0xFF0B7F75);
  static const brandDark = Color(0xFF065A53);
  static const brandDeep = Color(0xFF033B37);
  static const brandSoft = Color(0xFFE7F6F3);
  static const mint = Color(0xFF5EEAD4);

  static const ink = Color(0xFF0F172A);
  static const body = Color(0xFF334155);
  static const muted = Color(0xFF64748B);
  static const faint = Color(0xFF94A3B8);
  static const line = Color(0xFFE5E9F0);
  static const field = Color(0xFFF1F4F8);
  static const background = Color(0xFFF6F8FB);
  static const surface = Colors.white;

  static const success = Color(0xFF059669);
  static const successSoft = Color(0xFFECFDF5);
  static const warning = Color(0xFFD97706);
  static const warningSoft = Color(0xFFFFF7E6);
  static const danger = Color(0xFFE11D48);
  static const dangerSoft = Color(0xFFFFF1F3);
  static const info = Color(0xFF0369A1);
  static const infoSoft = Color(0xFFEFF7FF);
}

abstract final class AppShadows {
  static const card = [
    BoxShadow(color: Color(0x0A0F172A), blurRadius: 2, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x0F0F172A), blurRadius: 24, offset: Offset(0, 8)),
  ];
  static const floating = [
    BoxShadow(color: Color(0x1F0F172A), blurRadius: 32, offset: Offset(0, 12)),
  ];
}

ThemeData buildTheme() {
  const font = 'Inter';
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.brand,
    primary: AppColors.brand,
    onPrimary: Colors.white,
    surface: AppColors.surface,
    onSurface: AppColors.ink,
    onSurfaceVariant: AppColors.muted,
    outline: AppColors.faint,
    outlineVariant: AppColors.line,
    error: AppColors.danger,
  );

  TextStyle t(
    double size,
    FontWeight w, {
    double spacing = 0,
    double height = 1.3,
    Color color = AppColors.ink,
  }) => TextStyle(
    fontFamily: font,
    fontSize: size,
    fontWeight: w,
    letterSpacing: spacing,
    height: height,
    color: color,
  );

  final text = TextTheme(
    displaySmall: t(32, FontWeight.w800, spacing: -0.8, height: 1.15),
    headlineMedium: t(26, FontWeight.w800, spacing: -0.6, height: 1.2),
    headlineSmall: t(22, FontWeight.w700, spacing: -0.4, height: 1.25),
    titleLarge: t(19, FontWeight.w700, spacing: -0.3),
    titleMedium: t(16, FontWeight.w600, spacing: -0.1),
    titleSmall: t(14, FontWeight.w600),
    bodyLarge: t(16, FontWeight.w400, height: 1.5, color: AppColors.body),
    bodyMedium: t(14, FontWeight.w400, height: 1.45, color: AppColors.body),
    bodySmall: t(12.5, FontWeight.w400, height: 1.4, color: AppColors.muted),
    labelLarge: t(15, FontWeight.w600),
    labelMedium: t(12.5, FontWeight.w600, color: AppColors.muted),
    labelSmall: t(11, FontWeight.w600, spacing: 0.4, color: AppColors.muted),
  );

  final shape14 = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(14),
  );

  return ThemeData(
    useMaterial3: true,
    fontFamily: font,
    colorScheme: scheme,
    textTheme: text,
    scaffoldBackgroundColor: AppColors.background,
    splashFactory: InkSparkle.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.background,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge,
      foregroundColor: AppColors.ink,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 52),
        shape: shape14,
        textStyle: text.labelLarge,
        elevation: 0,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 52),
        shape: shape14,
        side: const BorderSide(color: AppColors.line, width: 1.2),
        foregroundColor: AppColors.ink,
        textStyle: text.labelLarge,
        backgroundColor: Colors.white,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.brand,
        textStyle: text.labelLarge,
        shape: shape14,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.field,
      hintStyle: text.bodyLarge?.copyWith(color: AppColors.faint),
      labelStyle: text.bodyMedium?.copyWith(color: AppColors.muted),
      floatingLabelStyle: text.bodyMedium?.copyWith(
        color: AppColors.brand,
        fontWeight: FontWeight.w600,
      ),
      prefixIconColor: AppColors.muted,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.brand, width: 1.6),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.danger, width: 1.2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: AppColors.danger, width: 1.6),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      height: 68,
      indicatorColor: AppColors.brandSoft,
      indicatorShape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => text.labelSmall?.copyWith(
          letterSpacing: 0,
          fontSize: 11.5,
          color: s.contains(WidgetState.selected)
              ? AppColors.brand
              : AppColors.muted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(
          size: 24,
          color: s.contains(WidgetState.selected)
              ? AppColors.brand
              : AppColors.muted,
        ),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        backgroundColor: AppColors.field,
        selectedBackgroundColor: Colors.white,
        selectedForegroundColor: AppColors.ink,
        foregroundColor: AppColors.muted,
        side: BorderSide.none,
        textStyle: text.labelMedium,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      titleTextStyle: text.titleLarge,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.ink,
      contentTextStyle: text.bodyMedium?.copyWith(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    dividerTheme: const DividerThemeData(
      color: AppColors.line,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      titleTextStyle: text.titleSmall,
      subtitleTextStyle: text.bodySmall,
      iconColor: AppColors.muted,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: AppColors.brand,
    ),
  );
}
