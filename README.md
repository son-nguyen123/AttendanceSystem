# AttendanceSystem

Ứng dụng nội bộ hỗ trợ xử lý bảng chấm công Excel, quản lý lịch sử theo tháng,
đồng bộ dữ liệu giữa các biểu mẫu của Xưởng 1 và Xưởng 2, tính lương và xuất
danh sách chuyển lương cho ngân hàng.

## Chức năng chính

- Phân tích bảng chấm công Excel và xuất `Output 1`, `Output 2`.
- Gán dữ liệu theo mã nhân viên và ý nghĩa cột, không phụ thuộc cứng vào vị trí ô.
- Giữ công thức tính lương trong file xuất và hỗ trợ tính lại sau khi sửa dữ liệu.
- Quản lý bản đang phân tích, bản sao cuối cùng và lịch sử theo tháng/năm.
- Xuất ảnh bảng công nhân viên.
- Quản lý số tài khoản và xuất bảng lương ngân hàng dạng Word.
- Sao lưu file lên Google Drive; có thể bật thêm Supabase khi cần.
- Hỗ trợ cả Xưởng 1 và Xưởng 2.

## Công nghệ

- Frontend: React, TypeScript, Vite, Material UI và AG Grid.
- Backend: Python, FastAPI, pandas và openpyxl.
- Lưu trữ local: SQLite và thư mục dữ liệu cục bộ.
- Sao lưu: Google Drive; Supabase là tùy chọn và được tắt mặc định.

## Cài nhanh trên Windows

Máy mới cần kết nối Internet trong lần cài đầu tiên.

```bat
git clone https://github.com/son-nguyen123/AttendanceSystem.git
cd AttendanceSystem
setup.bat
setup-storage.bat
start.bat
```

Các script sẽ tải môi trường Python và Node cần thiết, cài thư viện, hướng dẫn
chọn thư mục Google Drive và khởi động ứng dụng.

Sau khi chạy:

- Giao diện: <http://127.0.0.1:5173>
- Backend API: <http://127.0.0.1:8000>
- Kiểm tra backend: <http://127.0.0.1:8000/health>

Để dừng ứng dụng:

```bat
stop.bat
```

Hướng dẫn cài đặt và chuyển sang máy khác chi tiết nằm trong
[`README_SETUP.txt`](README_SETUP.txt).

## Chạy thủ công để phát triển

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Kiểm tra mã frontend:

```powershell
npm run lint
npm run build
```

Chạy kiểm thử backend:

```powershell
cd backend
python -m unittest discover -s tests
```

## Lưu trữ và khôi phục dữ liệu

Ứng dụng vẫn lưu dữ liệu làm việc trên máy để xử lý nhanh. Google Drive đóng vai
trò sao lưu và giúp khôi phục dữ liệu khi đổi máy. Vì vậy, sau khi tải mã nguồn
từ GitHub, ứng dụng có thể cài và chạy nhưng dữ liệu nghiệp vụ cũ cần được khôi
phục từ Drive hoặc từ bản sao lưu riêng.

Supabase vẫn được hỗ trợ nhưng tắt mặc định. Khi chỉ sử dụng Google Drive, máy
mới không cần URL hoặc khóa Supabase và không phát sinh lỗi kết nối Supabase.
Lược đồ dành cho tùy chọn này nằm tại
[`docs/supabase_schema.sql`](docs/supabase_schema.sql).

## Dữ liệu không được đưa lên GitHub

Repository chỉ lưu mã nguồn, kiểm thử, tài liệu và script cài đặt. Các nội dung
sau được loại trừ để bảo vệ dữ liệu:

- File Excel/Word/PDF thực tế và ảnh chấm công.
- Cơ sở dữ liệu, lịch sử nhân viên và số tài khoản ngân hàng.
- Cấu hình Google Drive, URL và khóa bí mật Supabase.
- Log, thư viện đã cài, môi trường portable và file tạm.
- Các file `.env`.

Không commit khóa bí mật hoặc dữ liệu nhân viên lên repository. Khi cài trên máy
mới, hãy cấu hình lại kết nối và khôi phục dữ liệu từ nguồn sao lưu được phép.

## Cấu trúc thư mục

```text
AttendanceSystem/
├── backend/             FastAPI, xử lý Excel và lưu trữ
├── frontend/            Giao diện React
├── scripts/             Script cài đặt, chạy và dừng ứng dụng
├── docs/                Tài liệu nghiệp vụ và lược đồ Supabase
├── setup.bat            Cài môi trường
├── setup-storage.bat    Cấu hình Google Drive/lưu trữ
├── start.bat            Khởi động ứng dụng
└── stop.bat             Dừng ứng dụng
```

## Ghi chú

Đây là ứng dụng phục vụ quy trình chấm công riêng. Trước khi dùng với dữ liệu
thật, nên thử bằng một bản sao Excel và kiểm tra lại công thức, mã nhân viên,
tổng giờ công và tiền lương của file đầu ra.
