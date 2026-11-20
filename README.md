# OnLuyen Mod Mobile v1.0 (Android & iOS)

Ứng dụng di động **OnLuyen** được thiết kế **như một app OnLuyen bình thường** (nền sáng sạch sẽ, làm bài và nộp bài thủ công hoàn toàn tự nhiên, không hiện giao diện thừa). Khi cần hỗ trợ, bạn chỉ cần chạm vào **nút kính mờ nhỏ ở góc dưới bên phải** để bật **Mod Menu**.

---

## Tải về & Cài đặt (Releases)

Tải trực tiếp file cài đặt đã build sẵn tại trang **GitHub Releases**:

- **Trang Releases chính thức**: https://github.com/haccnk/OnLuyen-Mod-Mobile/releases
- **Bản phát hành v1.0**: https://github.com/haccnk/OnLuyen-Mod-Mobile/releases/tag/v1.0
  - **Android**: Tải trực tiếp **`OnLuyen_Mod_Mobile-v1.0.apk`** về điện thoại Android và mở để cài đặt *(bật "Cài đặt ứng dụng từ nguồn không xác định" nếu hệ thống hỏi)*.
  - **iOS (Unsigned IPA)**: Tải **`OnLuyen_Mod_Mobile-v1.0-unsigned.ipa`** để cài qua **AltStore**, **SideStore**, **Sideloadly** hoặc **TrollStore**.
- **Link dự phòng (GitHub Actions Artifacts)**: https://github.com/haccnk/OnLuyen-Mod-Mobile/actions

---

## Trải nghiệm Stealth: App bình thường + Mod Menu góc dưới phải

1. **Mặc định như app OnLuyen gốc**:
   - Tên app hiển thị **`OnLuyen`**, mở thẳng `https://app.onluyen.vn` toàn màn hình.
   - Chế độ tự động giải **mặc định TẮT** — bạn tự đọc đề, tự làm và tự nộp bài hoàn toàn bình thường, không có thông báo hay banner làm phiền.
2. **Nút Mod Menu gọn nhẹ ở góc dưới phải**:
   - **Khi Mod đang TẮT**: Chỉ là một chấm tròn kính mờ `34×34` (không chữ, không phát sáng) ở góc dưới bên phải. Chạm nhẹ để mở **Menu hỗ trợ** (có thể kéo thả sang mép trái/phải tùy tay thuận).
   - **Khi bật Mod (`Tự động giải: BẬT`)**: Nút chuyển thành chỉ báo trạng thái nhỏ gọn (hiện kết quả ngắn khi chốt). **Nhấn giữ** nút góc dưới phải (hoặc bấm nút 👁️ **Về app thường** trên menu) để tắt nhanh Mod và quay về giao diện app bình thường ngay lập tức.
   - **Chế độ Tàng hình tối đa** (trong *Tùy chọn nâng cao*): Thu nhỏ nút góc dưới phải thành chấm siêu mờ `8×8` gần như vô hình khi Mod tắt — chạm đúp hoặc nhấn giữ vào góc để mở Mod Menu.

---

## Hướng dẫn cấu hình API Key & Sử dụng

> **Bảo mật 0% Key lưu cứng**: Toàn bộ mã nguồn không chứa bất kỳ Gemini API Key nào. Key của bạn chỉ được lưu cục bộ trong thiết bị.

1. Mở app -> chạm vào **nút nhỏ ở góc dưới bên phải** để mở **Menu hỗ trợ**.
2. Bấm biểu tượng **Chìa khóa (`API Key`)**.
3. Dán **1 hoặc nhiều** Gemini API Key (mỗi key 1 dòng hoặc ngăn cách dấu phẩy), đặt nhãn gợi nhớ -> bấm **Thêm vào bộ xoay vòng**.
4. Bấm **⚡ Kiểm tra tất cả Key (Test Live)** để kiểm tra trạng thái thực tế (`🟢 Sống` + độ trễ `ms`, `🟡 429` hoặc `🔴 Lỗi`) trên `gemini-3.1-flash-lite` và `gemini-3-flash-preview`.
5. Quay lại làm bài — khi nào muốn app tự giải thì mở Menu góc dưới phải và gạt **Tự động giải** sang BẬT (hoặc bấm **Quét ngay**).

---

## Công nghệ bên trong (chỉ chạy khi bật Mod)

- **WebView sạch & Giữ phiên đăng nhập**: User-Agent chuẩn (gỡ `; wv)` của Android WebView), hỗ trợ popup đăng nhập Google OAuth, `AT_DOCUMENT_START` chống mất focus (`inject.js`), kèm công tắc **Mobile / Desktop Mode**.
- **Đọc đề dài ngoài viewport & Xử lý Hình ảnh 3 Lớp**:
  - Đọc trọn vẹn đề dài, đoạn văn, 4 mệnh đề Đúng/Sai và 4 đáp án dù bị khuất ngoài màn hình, tối ưu màn hình dọc `360–430px`.
  - Câu chỉ có chữ / LaTeX / `[GẠCH_CHÂN: ...]` chỉ gửi HTML sạch (không chụp ảnh -> tiết kiệm token).
  - Câu có hình vẽ / đồ thị / bảng biến thiên tự xử lý 3 lớp: **Lớp 1** bóc ảnh full-res (`<img>` kèm cookie phiên, `<canvas>`, `<svg>` 2x PNG) -> **Lớp 2 (`Auto Capture Stage`)** ẩn tạm nút nổi và dựng sân khấu nền trắng `#__onluyen_capture_stage` để chụp -> **Lớp 3** cuộn gom đa khung fallback.
  - Tự `scrollIntoView({ behavior: "instant", block: "center" })` và kiểm tra lại DOM sau `250ms` (**Post-Click DOM Verification**).
- **Bộ não Multi-Agent 4 Tầng (Native Dart)**:
  - **Tầng 0 (`RiskScorer`)**: Chấm điểm độ rắc rối `0–100`.
  - **Tầng 1 (`Agent 1` + `ConsistencyChecker`)**: Giải chuẩn GDPT 2018 + tự kiểm tra mâu thuẫn nội bộ + lưới cứu hộ `MAX_TOKENS`.
  - **Tầng 2 (`Agent 2` Cross-Model Auditor)**: Phản biện độc lập bằng model khác với Agent 1.
  - **Tầng 3 (`Agent 3` Tie-Breaker Trọng tài)**: Phân xử khi Agent 1 và Agent 2 cho đáp án khác nhau.

---

## Tự Build / CI-CD (`haccnk/OnLuyen-Mod-Mobile`)

Mỗi lần push lên nhánh `main` của repository `haccnk/OnLuyen-Mod-Mobile`, GitHub Actions tự động:
1. Chạy `node --check` và 20 bài test DOM/Agent trong `test/js/run_tests.js`.
2. Quét xác minh 0% API Key rò rỉ trong toàn bộ mã nguồn.
3. Chạy `flutter analyze`, `flutter test`, biên dịch `.apk` (Android) và `.ipa` unsigned (iOS), rồi tự động đính kèm lên [Releases v1.0](https://github.com/haccnk/OnLuyen-Mod-Mobile/releases/tag/v1.0) và GitHub Actions Artifacts.
