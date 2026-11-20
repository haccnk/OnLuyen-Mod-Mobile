# OnLuyen Mod Mobile v1.0 (Android & iOS)

Ứng dụng di động **OnLuyen Mod Mobile v1.0** mở trực tiếp `https://app.onluyen.vn` toàn màn hình trên WebView đã được mod sẵn (giữ trạng thái luôn tập trung, đọc trọn vẹn đề dài ngoài viewport, bóc ảnh 3 lớp và giải bằng bộ não **Multi-Agent 4 Tầng** chạy hoàn toàn trên Native Dart).

---

## Tải về & Cài đặt (Releases)

Bạn có thể tải trực tiếp file cài đặt đã build sẵn tại trang **GitHub Releases**:

- **Trang Releases chính thức**: https://github.com/haccnk/OnLuyen-Mod-Mobile/releases
- **Bản phát hành v1.0**: https://github.com/haccnk/OnLuyen-Mod-Mobile/releases/tag/v1.0
  - **Android**: Tải trực tiếp **`OnLuyen_Mod_Mobile-v1.0.apk`** về điện thoại Android và mở để cài đặt *(bật "Cài đặt ứng dụng từ nguồn không xác định" nếu hệ thống hỏi)*.
  - **iOS (Unsigned IPA)**: Tải **`OnLuyen_Mod_Mobile-v1.0-unsigned.ipa`** để cài qua **AltStore**, **SideStore**, **Sideloadly** hoặc **TrollStore**.
- **Link dự phòng (GitHub Actions Artifacts)**: https://github.com/haccnk/OnLuyen-Mod-Mobile/actions

---

## Hướng dẫn cấu hình API Key & Sử dụng

> **Bảo mật 0% Key lưu cứng**: Toàn bộ mã nguồn không chứa bất kỳ Gemini API Key nào. Key của bạn chỉ được lưu cục bộ trong thiết bị.

1. Mở ứng dụng **OnLuyen Mod** trên điện thoại -> chạm vào **bong bóng nổi `Chưa có Key`**.
2. Bấm biểu tượng **Chìa khóa (Cài đặt Đa API Key)**.
3. Dán **1 hoặc nhiều** Gemini API Key (mỗi key 1 dòng hoặc ngăn cách dấu phẩy), đặt nhãn gợi nhớ -> bấm **Thêm vào bộ xoay vòng**.
4. Bấm **⚡ Kiểm tra tất cả Key (Test Live)** để kiểm tra trạng thái thực tế (`🟢 Sống` + độ trễ `ms`, `🟡 429` hoặc `🔴 Lỗi`) trên `gemini-3.1-flash-lite` và `gemini-3-flash-preview`.
5. Quay lại màn hình chính, đăng nhập tài khoản OnLuyen và mở bài tập — bong bóng nổi sẽ tự quét và tích đáp án.
   - **Chạm nhẹ bong bóng**: Mở bảng điều khiển (`Fast / Smart / Ultra`, Quét ngay, Giải lại câu hiện tại hoặc nhập số câu, đổi Mobile/Desktop WebView, xem Lịch sử và xuất/chia sẻ `.txt`).
   - **Nhấn giữ bong bóng**: Bật / Tắt nhanh chế độ tự động giải.

---

## Kiến trúc chính

- **WebView Mod (`flutter_inappwebview`)**:
  - Tiêm `assets/js/inject.js` tại `AT_DOCUMENT_START` (chặn `blur`, `visibilitychange`, `focusout`, `mouseleave`, giữ `document.hidden = false`).
  - Tiêm `assets/js/dom_extractor_mobile.js` + `assets/js/mobile_agent.js` tại `AT_DOCUMENT_END`.
  - User-Agent sạch (loại bỏ `; wv)` của Android WebView) + bật `CookieManager` & popup OAuth để đăng nhập Google ổn định, kèm công tắc đổi nhanh **Mobile / Desktop Mode**.
- **Đọc đề dài & Xử lý Hình ảnh 3 Lớp**:
  - Đọc trọn vẹn đề, đoạn văn, 4 mệnh đề Đúng/Sai và 4 đáp án dù bị khuất ngoài màn hình (`top < 0` hoặc `top > viewportHeight`), vá lỗi nhận nhầm khung chính trên màn hình dọc `360–430px`.
  - Câu chỉ có chữ / LaTeX / `[GẠCH_CHÂN: ...]` chỉ gửi HTML sạch (không chụp ảnh -> tiết kiệm token và cực nhanh).
  - Câu có hình vẽ / đồ thị / bảng biến thiên tự xử lý 3 lớp: **Lớp 1** bóc ảnh full-res (`<img>` kèm cookie phiên, `<canvas>`, `<svg>` render `2x` PNG) -> **Lớp 2 (`Auto Capture Stage`)** tự ẩn bong bóng nổi và dựng sân khấu phóng lớn nền trắng `#__onluyen_capture_stage` để chụp -> **Lớp 3** cuộn gom đa khung fallback.
  - Tự `scrollIntoView({ behavior: "instant", block: "center" })` trước khi chọn và kiểm tra lại DOM sau `250ms` (**Post-Click DOM Verification**).
- **Bộ não AI Multi-Agent 4 Tầng (Native Dart)**:
  - **Tầng 0 (`RiskScorer`)**: Chấm điểm độ rắc rối `0–100`.
  - **Tầng 1 (`Agent 1` + `ConsistencyChecker`)**: Tự giải chuyên sâu theo chuẩn GDPT 2018 + tự kiểm tra mâu thuẫn nội bộ + lưới cứu hộ `MAX_TOKENS`.
  - **Tầng 2 (`Agent 2` Cross-Model Auditor)**: Phản biện độc lập bằng model khác với Agent 1 trên các câu rủi ro cao / phân vân / mâu thuẫn / giải lại.
  - **Tầng 3 (`Agent 3` Tie-Breaker Trọng tài)**: Phân xử khi Agent 1 và Agent 2 cho đáp án khác nhau.

---

## Tự Build / CI-CD (`haccnk/OnLuyen-Mod-Mobile`)

Mỗi lần push lên nhánh `main` của repository `haccnk/OnLuyen-Mod-Mobile`, GitHub Actions tự động:
1. Chạy `node --check` và 20 bài test DOM/Agent trong `test/js/run_tests.js`.
2. Quét xác minh 0% API Key rò rỉ trong toàn bộ mã nguồn.
3. Chạy `flutter analyze`, `flutter test`, biên dịch `.apk` (Android) và `.ipa` unsigned (iOS), rồi tự động đính kèm lên [Releases v1.0](https://github.com/haccnk/OnLuyen-Mod-Mobile/releases/tag/v1.0) và GitHub Actions Artifacts.
