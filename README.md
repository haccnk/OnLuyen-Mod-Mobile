# OnLuyen Mod Mobile v1.0 (Android & iOS)

Ứng dụng di động **OnLuyen Mod Mobile v1.0** mở trực tiếp `https://app.onluyen.vn` toàn màn hình trên WebView đã được mod sẵn (giữ trạng thái luôn tập trung, tự đọc đề dài ngoài viewport, bóc ảnh 3 lớp và giải bằng bộ não Multi-Agent 4 Tầng trên Native Dart).

## Kiến trúc chính
- **WebView Mod (`flutter_inappwebview`)**:
  - Tiêm `assets/js/inject.js` tại `AT_DOCUMENT_START` (chặn `blur`, `visibilitychange`, `focusout`, giữ `document.hidden = false`).
  - Tiêm `assets/js/dom_extractor_mobile.js` + `assets/js/mobile_agent.js` tại `AT_DOCUMENT_END`.
  - User-Agent sạch (loại bỏ `; wv)` của Android WebView) + bật `CookieManager` & popup OAuth để đăng nhập Google ổn định, kèm công tắc đổi nhanh **Mobile / Desktop Mode**.
- **Đọc đề dài & Xử lý Hình ảnh 3 Lớp**:
  - Đọc trọn vẹn đề, đoạn văn, 4 mệnh đề Đúng/Sai và 4 đáp án dù bị khuất ngoài màn hình (`top < 0` hoặc `top > viewportHeight`), vá lỗi nhận nhầm khung chính trên màn hình dọc `360–430px`.
  - Câu chỉ có chữ / LaTeX / `[GẠCH_CHÂN: ...]` chỉ gửi HTML sạch (không chụp ảnh).
  - Câu có hình vẽ / đồ thị / bảng biến thiên tự xử lý 3 lớp: **Lớp 1** bóc ảnh full-res (`<img>` kèm cookie, `<canvas>`, `<svg>` render `2x` PNG) -> **Lớp 2 (`Auto Capture Stage`)** tự ẩn bong bóng nổi và dựng sân khấu phóng lớn nền trắng `#__onluyen_capture_stage` để chụp -> **Lớp 3** cuộn gom đa khung fallback.
  - Tự `scrollIntoView({ behavior: "instant", block: "center" })` trước khi chọn và kiểm tra lại DOM sau `250ms` (**Post-Click DOM Verification**).
- **Bộ não AI Multi-Agent 4 Tầng (Native Dart)**:
  - **Tầng 0 (`RiskScorer`)**: Chấm điểm độ rắc rối `0–100`.
  - **Tầng 1 (`Agent 1` + `ConsistencyChecker`)**: Tự giải chuyên sâu theo chuẩn GDPT 2018 + tự kiểm tra mâu thuẫn nội bộ + lưới cứu hộ `MAX_TOKENS`.
  - **Tầng 2 (`Agent 2` Cross-Model Auditor)**: Phản biện độc lập bằng model khác với Agent 1 trên các câu rủi ro cao / phân vân / mâu thuẫn / giải lại.
  - **Tầng 3 (`Agent 3` Tie-Breaker Trọng tài)**: Phân xử khi Agent 1 và Agent 2 cho đáp án khác nhau.
- **Bảo mật 0% Key lưu cứng**: Toàn bộ Gemini API Key do người dùng tự nhập, bật/tắt và Test Live ngay trong **Cài đặt Đa API Key** của ứng dụng.

---

## Hướng dẫn 3 bước đẩy lên GitHub để tự động build file `.apk` (Android) / `.ipa` (iOS)

> Máy Windows không cần cài Flutter, Java JDK hay Android SDK — GitHub Actions sẽ tự động kiểm tra mã nguồn, chạy test và biên dịch ra file cài đặt.

### Bước 1: Tạo Repository mới trên GitHub
1. Truy cập https://github.com/new và tạo một repository mới (khuyến nghị đặt tên `OnLuyen-Mod-Mobile`, để **Private** nếu muốn dùng riêng).

### Bước 2: Đẩy mã nguồn từ `D:\OnLuyen_Mod_Mobile` lên GitHub
Mở PowerShell tại `D:\OnLuyen_Mod_Mobile` và chạy:
```powershell
git init
git add .
git commit -m "feat: OnLuyen Mod Mobile v1.0"
git branch -M main
git remote add origin https://github.com/<ten-tai-khoan-cua-ban>/OnLuyen-Mod-Mobile.git
git push -u origin main
```

### Bước 3: Tải file `.apk` (hoặc `.ipa` unsigned)
1. Vào tab **Actions** trên repository GitHub của bạn.
2. Đợi workflow **`Build Android APK (OnLuyen Mod Mobile)`** (chạy khoảng 4–6 phút) hiện dấu tích xanh ✔.
3. Bấm vào lượt chạy mới nhất -> kéo xuống mục **Artifacts** -> tải **`OnLuyen-Mod-Mobile-Android-APK`** về máy Android để cài đặt (hoặc tải **`OnLuyen-Mod-Mobile-iOS-IPA-Unsigned`** nếu dùng iOS sideload/AltStore/Sideloadly).

### Sau khi cài đặt trên điện thoại
1. Mở app -> chạm vào **bong bóng nổi `Chưa có Key`** -> bấm biểu tượng **Chìa khóa (Cài đặt API Key)**.
2. Dán 1 hoặc nhiều Gemini API Key của bạn -> bấm **⚡ Kiểm tra tất cả Key (Test Live)** để xác nhận đèn **🟢 Sống**.
3. Quay lại màn hình chính, đăng nhập OnLuyen và mở bài tập — app sẽ tự động quét và tích đáp án!
