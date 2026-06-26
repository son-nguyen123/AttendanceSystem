Attendance System - huong dan dong goi portable
===============================================

1. Tren may dang phat trien, chay:
   setup.bat

2. Script setup se:
   - Tai Python portable vao runtime\python
   - Tai Node portable vao runtime\node
   - Cai thu vien backend tu backend\requirements.txt
   - Cai frontend packages bang npm install
   - Tao shortcut Attendance System ngoai Desktop

3. Sau khi setup xong, co the chay app bang:
   start.bat

4. De tat server:
   stop.bat

5. Neu muon gui cho nguoi khac:
   - Chay setup.bat truoc de co thu muc runtime
   - Nen xoa thu muc logs neu muon nhe hon
   - Nen GIU backend\storage neu muon mang theo lich su du lieu
   - Nen XOA backend\storage neu muon gui ban sach khong co du lieu cu
   - Nen nen ca folder AttendanceSystem thanh file .zip roi gui Google Drive/OneDrive

6. Tren may nguoi nhan:
   - Giai nen zip
   - Bam setup.bat mot lan de tao shortcut Desktop
   - Sau do bam icon Attendance System hoac start.bat

Ghi chu:
- App dung port 8000 cho backend va 5173 cho frontend.
- Neu port bi ung dung khac chiem, hay dong ung dung do hoac chay stop.bat.
- Du lieu lich su nam trong backend\storage.
