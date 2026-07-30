Attendance System - setup may chu / may moi
============================================

MUC TIEU
--------
Sau khi tai file .zip tu Google Drive va giai nen, may moi chi can:
1. Chay setup.bat de tai/cai moi truong Python + Node va cac thu vien.
2. Chay setup-storage.bat de dang nhap Google Drive. Supabase duoc tat mac dinh.
3. Chay start.bat de mo ung dung.

Khong bat tinh nang dang nhap cua app. "Dang nhap" trong tai lieu nay la dang nhap
Google Drive for desktop va/hoac Supabase Dashboard.


BUOC 1 - CAI MOI TRUONG
-----------------------
Chay:
  setup.bat

Script se:
- Tai Python portable vao runtime\python.
- Tai Node portable vao runtime\node.
- Cai thu vien backend tu backend\requirements.txt.
- Cai frontend packages bang npm ci neu co package-lock.json, nguoc lai npm install.
- Tao shortcut Attendance System ngoai Desktop.

Neu ban dong goi kem runtime va frontend\node_modules, setup se kiem tra va bo qua
nhung phan da du. Neu khong dong goi, may moi can Internet trong lan setup dau tien.


BUOC 2 - CHON HUONG LUU TRU
---------------------------
Chay:
  setup-storage.bat

Script co the cai Google Drive for desktop bang lenh winget chinh thuc:
  winget install --id Google.GoogleDrive --exact --accept-package-agreements --accept-source-agreements

Sau do dang nhap Google Drive, cho den khi File Explorer thay My Drive, roi chon
thu muc AttendanceSystem_Backup nam BEN TRONG My Drive.

Che do mac dinh - chi Local + Google Drive
- SQLite local van nam tai backend\storage\attendance_history.db.
- File Excel va ban zip duoc ghi vao thu muc Google Drive da chon.
- setup-storage.bat luon luu enabled=false va sync_on_save=false.
- App khong goi Supabase, nen may moi khong can URL/key va khong phat sinh loi ket noi.

Tuy chon nang cao - Local + Google Drive + Supabase
- Supabase van la mot phan cua app, nhung khong duoc bat trong luc cai dat.
- Chi bat sau nay trong tab Sao luu du lieu > Cai dat nang cao neu chu that su can.
- Dang nhap https://supabase.com/dashboard va tao/chon project.
- Mo SQL Editor, chay toan bo docs\supabase_schema.sql mot lan.
- Lay Project URL va secret key (sb_secret_...) hoac legacy service_role key tai
  Project Settings > API Keys. Code backend ho tro ca hai loai key.
- Dan URL/key vao cua so setup. Key chi luu o backend\storage\cloud_config.json.

Supabase la tuy chon. Muon tat sau nay: vao tab Sao luu du lieu > Cai dat nang cao,
bo chon "Bat sao luu du lieu online" va bam Luu cau hinh. Google Drive van hoat
dong neu "Sao luu Excel vao Google Drive" con duoc bat.


BUOC 3 - CHAY VA KIEM TRA
-------------------------
Chay:
  start.bat

App dung:
- Backend: http://127.0.0.1:8000
- Frontend: http://127.0.0.1:5173

Trong app, vao tab Sao luu du lieu:
1. Kiem tra trang thai "File Excel tren Drive" la Dang bat.
2. Bam Mo Drive chinh va xac nhan dung thu muc My Drive.
3. Neu dung Supabase, bam Kiem tra ket noi.
4. Neu chi dung Drive, "Du lieu online" phai hien Dang tat.

De tat app:
  stop.bat


DONG GOI LEN GOOGLE DRIVE
-------------------------
1. Chay stop.bat truoc khi nen.
2. Khong dua backend\storage\cloud_config.json len Drive vi file nay co the chua
   Supabase service_role/secret key.
3. Ban sach cho may chu moi: bo ca backend\storage; app se tao SQLite moi.
4. Neu can mang lich su local: chi chep attendance_history.db va thu muc history,
   khong chep cloud_config.json.
5. Co the xoa logs de giam dung luong.
6. Nen ca folder AttendanceSystem thanh .zip roi tai len Google Drive.

Luu y: Google Drive backup cua app la thu muc dong bo boi Google Drive for desktop.
Neu chon nham thu muc ngoai My Drive, file chi nam tren dia local va se khong duoc
dua len tai khoan Google.
