# BÁO CÁO ĐỒ ÁN

# XÂY DỰNG HỆ THỐNG XỬ LÝ VÀ QUẢN LÝ DỮ LIỆU CHẤM CÔNG TỪ FILE EXCEL

## Lời cảm ơn

Trong quá trình thực hiện đề tài, em đã có cơ hội tìm hiểu sâu hơn về nghiệp vụ chấm công, xử lý dữ liệu Excel, xây dựng giao diện người dùng và thiết kế hệ thống phần mềm phục vụ nhu cầu thực tế tại doanh nghiệp. Em xin gửi lời cảm ơn đến giảng viên hướng dẫn đã định hướng, góp ý và hỗ trợ em trong quá trình hoàn thiện đồ án. Em cũng xin cảm ơn các anh chị phụ trách nghiệp vụ đã cung cấp tình huống thực tế, giúp em hiểu rõ hơn các vấn đề phát sinh trong quá trình chấm công và tính lương.

Do thời gian thực hiện và kinh nghiệm còn hạn chế, báo cáo không tránh khỏi thiếu sót. Em rất mong nhận được góp ý để hệ thống có thể tiếp tục được hoàn thiện hơn trong tương lai.

## Mục lục

| Mục | Nội dung |
| --- | --- |
| Chương 1 | Tổng quan đề tài |
| Chương 2 | Khảo sát hiện trạng và vấn đề công ty |
| Chương 3 | Phân tích yêu cầu hệ thống |
| Chương 4 | Thiết kế kiến trúc hệ thống |
| Chương 5 | Thiết kế dữ liệu |
| Chương 6 | Thiết kế bộ rules chấm công |
| Chương 7 | Giải thích xử lý code theo chức năng |
| Chương 8 | Giải thích thư viện và công nghệ sử dụng |
| Chương 9 | Thiết kế giao diện |
| Chương 10 | Biểu đồ, bảng và sơ đồ minh họa |
| Chương 11 | Kiểm thử hệ thống |
| Chương 12 | Đánh giá hệ thống |
| Chương 13 | Hướng phát triển |
| Chương 14 | Kết luận |
| Phụ lục A | Bảng tổng hợp rules chính |
| Phụ lục B | Bộ case kiểm tra đề xuất |
| Phụ lục C | Gợi ý danh mục hình ảnh trong báo cáo Word |
| Phụ lục D | Gợi ý kết cấu trang khi nộp |

## Danh mục thuật ngữ

| Thuật ngữ | Giải thích |
| --- | --- |
| Chấm công | Quá trình ghi nhận thời gian vào ra làm việc của nhân viên |
| Giờ bấm | Mốc thời gian nhân viên bấm thẻ, vân tay hoặc thiết bị chấm công |
| Ca sáng | Khung làm việc từ 07:30 đến 11:30 |
| Ca chiều | Khung làm việc từ 13:00 đến 17:00 |
| Ca tối | Khung làm việc từ 18:00 đến 22:00 |
| Quên bấm | Trường hợp thiếu mốc vào hoặc ra, không đủ dữ liệu xác định công |
| Đi trễ | Trường hợp nhân viên vào sau giờ bắt đầu ca |
| Manual check | Trường hợp cần người phụ trách kiểm tra thủ công |
| Workbook | File Excel chứa dữ liệu chấm công |
| Block nhân viên | Nhóm dòng trong workbook tương ứng với một nhân viên |
| Rule | Quy tắc xử lý nghiệp vụ dùng để tính công hoặc phát hiện lỗi |
| Payroll | Phần nghiệp vụ liên quan đến lương |

## Lời mở đầu

Trong nhiều doanh nghiệp vừa và nhỏ, dữ liệu chấm công vẫn được tổng hợp chủ yếu bằng file Excel xuất từ máy chấm công. Cách làm này quen thuộc, dễ sử dụng và phù hợp với thói quen của bộ phận hành chính nhân sự. Tuy nhiên, khi số lượng nhân viên tăng lên hoặc khi ca làm việc có nhiều trường hợp đặc biệt, việc xử lý thủ công trở nên mất thời gian và dễ sai sót.

Đề tài "Xây dựng hệ thống xử lý và quản lý dữ liệu chấm công từ file Excel" được thực hiện nhằm giải quyết vấn đề trên. Hệ thống cho phép người dùng tải file chấm công lên, tự động đọc dữ liệu, phát hiện giờ vào ra, tính công, phát hiện đi trễ, phát hiện quên bấm công, đánh dấu các trường hợp cần kiểm tra, hỗ trợ chỉnh sửa kết quả và lưu lịch sử phục vụ cho việc tính lương.

Điểm quan trọng của hệ thống không chỉ nằm ở việc đọc file Excel, mà còn nằm ở bộ quy tắc xử lý nghiệp vụ. Dữ liệu chấm công thực tế thường không sạch: có người bấm thiếu, bấm trùng, bấm ra vào giữa giờ, làm ca sáng, ca chiều, ca tối, làm nối ca, bấm sát ranh giới giữa các ca. Vì vậy, hệ thống cần có cách xử lý vừa tự động vừa thận trọng. Những trường hợp rõ ràng được tính tự động, còn những trường hợp mập mờ được đưa vào danh sách cần kiểm tra để người phụ trách quyết định.

## Chương 1. Tổng quan đề tài

### 1.1. Lý do chọn đề tài

Chấm công là một nghiệp vụ quan trọng trong công tác quản lý nhân sự. Kết quả chấm công ảnh hưởng trực tiếp đến tiền lương, phụ cấp, đánh giá chuyên cần và quản lý hiệu suất làm việc của nhân viên. Nếu dữ liệu chấm công bị tính sai, doanh nghiệp có thể gặp các vấn đề như trả sai lương, mất thời gian đối soát, phát sinh khiếu nại từ nhân viên hoặc thiếu cơ sở khi kiểm tra lịch sử công.

Trong thực tế, file chấm công từ máy thường chỉ ghi lại các mốc thời gian bấm thẻ. Máy chấm công không hiểu đầy đủ nghiệp vụ ca làm việc của công ty. Một ngày làm việc có thể có nhiều lần bấm, ví dụ vào sáng, ra trưa, vào chiều, ra chiều, vào tối, ra tối. Khi các mốc này đầy đủ và đúng giờ, việc tính công tương đối đơn giản. Tuy nhiên, dữ liệu thực tế thường phát sinh các tình huống phức tạp như:

- Nhân viên quên bấm vào hoặc bấm ra.
- Có nhiều lần bấm sát nhau do bấm trùng hoặc máy ghi nhận lặp.
- Có người ra ngoài giữa giờ rồi quay lại làm việc.
- Có người làm ca chiều nối sang ca tối.
- Có người ra chiều rồi vào lại ca tối.
- Có người bấm sớm trước ca tối, làm hệ thống khó biết đó là làm thêm hay chỉ là bấm chuẩn bị vào ca.
- Có mốc giờ sát ranh giới giữa ca chiều và ca tối như 17:22, 17:30, 17:33, 17:45.
- Có trường hợp dữ liệu chỉ có một mốc tối như 22:00, không thể xác định đó là giờ vào hay giờ ra.

Nếu xử lý hoàn toàn thủ công, người phụ trách phải đọc từng dòng, từng ngày và tự suy luận. Công việc này lặp lại theo tháng, tốn nhiều thời gian và dễ nhầm lẫn. Nếu xử lý tự động quá mạnh mà không có cảnh báo, hệ thống có thể tính sai những trường hợp mập mờ. Vì vậy, đề tài này chọn hướng xây dựng hệ thống tự động hóa có kiểm soát: tính phần chắc chắn, cảnh báo phần không chắc chắn.

### 1.2. Mục tiêu của đề tài

Mục tiêu tổng quát của đề tài là xây dựng một hệ thống hỗ trợ xử lý dữ liệu chấm công từ file Excel, giảm thao tác thủ công và nâng cao độ nhất quán khi tính công.

Các mục tiêu cụ thể gồm:

- Đọc được file Excel chấm công đầu vào.
- Phát hiện các block dữ liệu theo từng nhân viên.
- Tách danh sách giờ bấm trong từng ngày.
- Tính giờ công theo các ca làm việc của công ty.
- Phát hiện trường hợp đi trễ.
- Phát hiện trường hợp quên bấm công.
- Đánh dấu các trường hợp mập mờ cần kiểm tra thủ công.
- Cho phép người dùng xem, rà soát và chỉnh sửa kết quả.
- Xuất lại file kết quả sau khi xử lý.
- Lưu lịch sử kỳ công để phục vụ tra cứu và tính lương.
- Quản lý thông tin lương cơ bản và hỗ trợ tính lương theo công thực tế.

### 1.3. Phạm vi thực hiện

Đề tài tập trung vào xử lý dữ liệu chấm công từ file Excel có cấu trúc theo block nhân viên. Hệ thống không thay thế máy chấm công, không kết nối trực tiếp với thiết bị chấm công, mà xử lý file xuất ra từ hệ thống hiện có.

Phạm vi chức năng gồm:

- Upload file chấm công.
- Phân tích file.
- Tự động tính công theo rules.
- Hiển thị danh sách kết quả.
- Hiển thị danh sách cần kiểm tra.
- Cho phép chỉnh sửa công, số lần quên bấm, phút trễ và ghi chú.
- Xuất workbook kết quả.
- Lưu kỳ công vào lịch sử.
- Tra cứu lịch sử theo nhân viên, tháng, năm.
- Quản lý thông tin lương nhân viên.
- Tính bảng lương dựa trên dữ liệu công đã xử lý.

Ngoài phạm vi:

- Không xây dựng hệ thống nhận diện khuôn mặt.
- Không thay thế hoàn toàn quyết định của bộ phận nhân sự.
- Không xử lý mọi loại mẫu Excel bất kỳ, mà tập trung vào mẫu file chấm công thực tế của doanh nghiệp.
- Không tự động kết luận các tình huống nghiệp vụ không đủ dữ liệu.

### 1.4. Đối tượng sử dụng

Đối tượng sử dụng chính là nhân sự phụ trách chấm công, kế toán lương hoặc quản lý hành chính. Người dùng không nhất thiết phải có kiến thức kỹ thuật, nhưng cần hiểu quy định ca làm việc của công ty để rà soát các trường hợp hệ thống đánh dấu cần kiểm tra.

### 1.5. Ý nghĩa thực tiễn

Hệ thống giúp giảm thời gian xử lý bảng công hàng tháng, hạn chế sai sót do tính tay, chuẩn hóa cách áp dụng rule và tạo cơ sở lưu trữ lịch sử. Thay vì phải kiểm tra toàn bộ file, người dùng chỉ cần tập trung vào các dòng bất thường. Điều này phù hợp với thực tế doanh nghiệp, nơi dữ liệu chấm công ảnh hưởng trực tiếp đến tiền lương và cần được xử lý cẩn thận.

## Chương 2. Khảo sát hiện trạng và vấn đề công ty

### 2.1. Quy trình chấm công thủ công

Quy trình chấm công truyền thống thường diễn ra như sau:

1. Máy chấm công ghi nhận các lần bấm thẻ hoặc vân tay của nhân viên.
2. Cuối kỳ, người phụ trách xuất dữ liệu ra file Excel.
3. Người phụ trách mở file, kiểm tra từng nhân viên và từng ngày.
4. Dựa vào giờ bấm, người phụ trách xác định nhân viên làm ca nào, có đủ công hay không.
5. Các lỗi như quên bấm, đi trễ, về sớm hoặc ra ngoài giữa giờ được ghi chú thủ công.
6. Sau khi rà soát, bảng công được dùng để tính lương.

Quy trình này có ưu điểm là linh hoạt, người phụ trách có thể tự xử lý các trường hợp đặc biệt. Tuy nhiên, khi dữ liệu nhiều, phương pháp thủ công dễ bị quá tải.

### 2.2. Các khó khăn trong dữ liệu thực tế

Dữ liệu chấm công không giống dữ liệu lý tưởng. Một dòng dữ liệu có thể chứa nhiều mốc giờ, nhưng các mốc đó không được gắn nhãn là vào hay ra. Ví dụ, hệ thống chỉ nhận được chuỗi:

07:22, 11:31, 13:00, 17:01, 17:33, 17:45, 22:00

Từ chuỗi này, người phụ trách phải suy luận:

- 07:22 là vào sáng.
- 11:31 là ra trưa.
- 13:00 là vào chiều.
- 17:01 là ra chiều hoặc mốc kết thúc ca chiều.
- 17:33 là ra thêm, bấm nhầm hoặc chuẩn bị vào ca tối.
- 17:45 có thể là vào lại ca tối.
- 22:00 là ra tối.

Nếu cùng chuỗi trên nhưng thay 17:33 bằng 17:30, cách hiểu có thể khác. Đây chính là khó khăn lớn nhất: một vài phút lệch ở ranh giới ca có thể làm thay đổi kết quả tính công.

### 2.3. Các nhóm lỗi thường gặp

Các lỗi thường gặp trong dữ liệu chấm công gồm:

| Nhóm lỗi | Ví dụ | Hậu quả nếu xử lý sai |
| --- | --- | --- |
| Quên bấm vào | Chỉ có 11:30 và 17:00 | Không xác định được thời gian bắt đầu làm |
| Quên bấm ra | Có 07:30 nhưng không có giờ ra | Có thể tính thiếu hoặc tính dư công |
| Bấm trùng | 07:30, 07:32 | Dễ hiểu nhầm thành ra vào trong ca |
| Bấm sát ca | 17:22, 22:00 | Dễ nhầm giữa bấm sớm ca tối và làm thêm từ 17:00 |
| Làm nối ca | 13:00, 22:00 | Cần tách công chiều và công tối |
| Ra vào giữa giờ | 08:00, 09:30, 10:00, 11:30 | Cần trừ thời gian ra ngoài |
| Một mốc tối | 22:00 | Không biết là giờ vào hay giờ ra |

### 2.4. Yêu cầu nghiệp vụ từ công ty

Từ hiện trạng trên, hệ thống cần đáp ứng các yêu cầu nghiệp vụ sau:

- Tính công theo ca sáng, ca chiều và ca tối.
- Nhận diện giờ vào và giờ ra từ chuỗi giờ bấm.
- Cho phép làm tròn giờ công theo quy định.
- Phát hiện đi trễ theo từng ca.
- Phát hiện quên bấm công.
- Không tự động kết luận khi dữ liệu mập mờ.
- Có danh sách riêng cho các dòng cần kiểm tra.
- Cho phép người dùng chỉnh kết quả trước khi xuất file.
- Lưu được lịch sử để kiểm tra lại sau này.

### 2.5. Nguyên tắc thiết kế nghiệp vụ

Hệ thống được thiết kế theo ba nguyên tắc chính:

Thứ nhất, tự động hóa các trường hợp rõ ràng. Ví dụ, 07:22 và 11:31 được hiểu là một ca sáng hợp lệ; 18:00 và 22:00 được hiểu là ca tối hợp lệ.

Thứ hai, không tự suy đoán quá mạnh với dữ liệu thiếu. Nếu chỉ có một mốc giờ hoặc có nhiều cách hiểu, hệ thống đánh dấu cần kiểm tra.

Thứ ba, người dùng là người chốt cuối cùng. Hệ thống đóng vai trò hỗ trợ tính toán, phát hiện và gợi ý, nhưng không loại bỏ hoàn toàn vai trò kiểm tra của nhân sự.

## Chương 3. Phân tích yêu cầu hệ thống

### 3.1. Yêu cầu chức năng

Hệ thống cần có các chức năng sau:

| Mã yêu cầu | Tên chức năng | Mô tả |
| --- | --- | --- |
| F01 | Tải file chấm công | Người dùng chọn file Excel để hệ thống phân tích |
| F02 | Phân tích dữ liệu | Hệ thống đọc workbook, tìm block nhân viên và danh sách giờ bấm |
| F03 | Tính công tự động | Hệ thống áp dụng rules để tính giờ công từng ngày |
| F04 | Phát hiện quên bấm | Hệ thống ghi nhận số lần nghi quên bấm hoặc đánh dấu ? |
| F05 | Phát hiện đi trễ | Hệ thống tính số phút trễ theo ca |
| F06 | Danh sách cần kiểm tra | Hệ thống gom các dòng mập mờ để người dùng rà soát |
| F07 | Chỉnh sửa kết quả | Người dùng sửa công, quên bấm, phút trễ, ghi chú |
| F08 | Xuất file kết quả | Hệ thống tạo workbook đầu ra sau khi xử lý |
| F09 | Lưu lịch sử | Người dùng lưu kỳ công đã xử lý |
| F10 | Tra cứu lịch sử | Người dùng tìm lại dữ liệu theo nhân viên, tháng, năm |
| F11 | Quản lý lương | Người dùng nhập và cập nhật thông tin lương nhân viên |
| F12 | Tính lương | Hệ thống tính lương dựa trên công và dữ liệu lương |

### 3.2. Yêu cầu phi chức năng

Các yêu cầu phi chức năng gồm:

- Giao diện dễ sử dụng cho người không chuyên kỹ thuật.
- Thời gian xử lý file nhanh hơn cách kiểm tra thủ công.
- Kết quả có thể rà soát lại.
- Dữ liệu lịch sử được lưu cục bộ, dễ tra cứu.
- Hệ thống phải hạn chế ghi đè dữ liệu sai.
- File đầu ra cần giữ được định dạng bảng công để người dùng tiếp tục sử dụng.
- Quy tắc xử lý phải nhất quán giữa các lần chạy.

### 3.3. Use case tổng quát

Các tác nhân chính:

- Nhân sự chấm công.
- Kế toán lương.
- Quản lý.

Các use case chính:

| Tác nhân | Use case |
| --- | --- |
| Nhân sự chấm công | Tải file, xem kết quả, kiểm tra lỗi, chỉnh sửa, xuất file |
| Kế toán lương | Lưu kỳ công, tính lương, xuất dữ liệu lương |
| Quản lý | Tra cứu lịch sử, xem tổng quan công và lỗi |

### 3.4. Sơ đồ use case đề xuất

Hình 3.1. Sơ đồ use case hệ thống chấm công

Mô tả sơ đồ:

- Ở giữa là hệ thống xử lý chấm công.
- Tác nhân "Nhân sự" kết nối với các chức năng tải file, phân tích file, xem dòng cần kiểm tra, chỉnh sửa kết quả và xuất file.
- Tác nhân "Kế toán" kết nối với chức năng lưu kỳ công, quản lý lương và tính lương.
- Tác nhân "Quản lý" kết nối với chức năng tra cứu lịch sử và xem tổng quan.

Khi đưa vào báo cáo Word, có thể vẽ sơ đồ bằng ba actor ở ngoài và các oval chức năng ở trong khung hệ thống.

## Chương 4. Thiết kế kiến trúc hệ thống

### 4.1. Kiến trúc tổng thể

Hệ thống được xây dựng theo mô hình frontend - backend. Frontend chịu trách nhiệm giao diện người dùng, nhận file, hiển thị kết quả và gửi các thao tác chỉnh sửa. Backend chịu trách nhiệm xử lý nghiệp vụ, đọc ghi file Excel, tính công, lưu lịch sử và trả dữ liệu cho frontend.

Kiến trúc tổng quát gồm ba lớp:

1. Lớp giao diện người dùng: React, TypeScript, Vite.
2. Lớp API và xử lý nghiệp vụ: FastAPI, Python.
3. Lớp dữ liệu: file Excel đầu vào/đầu ra, SQLite lưu lịch sử, dữ liệu cấu hình lương.

### 4.2. Sơ đồ kiến trúc

Hình 4.1. Sơ đồ kiến trúc hệ thống

Mô tả sơ đồ:

- Người dùng thao tác trên trình duyệt.
- Trình duyệt gửi file Excel qua API.
- Backend nhận file và gọi các service xử lý.
- Service đọc workbook, phát hiện block, tách giờ bấm và tính công.
- Kết quả phân tích được trả về frontend.
- Người dùng chỉnh sửa nếu cần.
- Backend xuất file kết quả hoặc lưu lịch sử vào SQLite.

### 4.3. Luồng xử lý chính

Luồng xử lý một file chấm công gồm:

1. Người dùng chọn file Excel.
2. Frontend gửi file lên backend.
3. Backend lưu file tạm trong session xử lý.
4. Backend mở workbook bằng thư viện xử lý Excel.
5. Hệ thống tìm sheet và block chấm công.
6. Với từng nhân viên, hệ thống đọc từng ngày công.
7. Chuỗi giờ bấm được tách thành danh sách thời gian.
8. Bộ calculator áp dụng rules để tính công.
9. Kết quả được gom lại theo nhân viên và ngày.
10. Các dòng có vấn đề được đưa vào danh sách cần kiểm tra.
11. Frontend hiển thị kết quả.
12. Người dùng chỉnh sửa nếu cần.
13. Hệ thống xuất file hoặc lưu lịch sử.

### 4.4. Các thành phần backend

Backend được chia thành nhiều module để tách trách nhiệm:

| Thành phần | Vai trò |
| --- | --- |
| routes_attendance | Nhận file chấm công, gọi xử lý và xuất kết quả |
| routes_history | Quản lý lưu, tra cứu, cập nhật lịch sử kỳ công |
| routes_payroll | Quản lý nhân viên và thông tin lương |
| workbook_processor | Đọc workbook, xử lý block nhân viên, ghi kết quả |
| block_detector | Tìm vị trí block chấm công trong file |
| punch_parser | Tách chuỗi giờ bấm thành danh sách mốc thời gian |
| attendance_calculator | Tính công, đi trễ, quên bấm, cảnh báo thủ công |
| workbook_normalizer | Chuẩn hóa file khi cấu trúc chưa đúng mẫu |
| workbook_recalculator | Tính lại tổng công trong workbook đã chỉnh |
| history_store | Lưu và truy xuất dữ liệu lịch sử bằng SQLite |
| payroll_store | Lưu thông tin lương và tính các giá trị lương |
| payroll_workbook | Xuất dữ liệu liên quan đến bảng lương |

### 4.5. Các thành phần frontend

Frontend gồm một ứng dụng React chính, trong đó có các màn hình và vùng chức năng:

- Khu vực tải file và chọn kỳ công.
- Khu vực xem kết quả phân tích.
- Bảng nhân viên và bảng ngày công.
- Panel danh sách cần kiểm tra.
- Form quản lý thông tin lương.
- Màn hình lịch sử kỳ công.
- Màn hình tổng quan công theo tháng.
- Các chức năng xuất file, lưu lịch sử và chỉnh sửa.

### 4.6. Lý do chọn kiến trúc frontend - backend

Mô hình frontend - backend giúp tách giao diện khỏi xử lý nghiệp vụ. Frontend tập trung vào trải nghiệm người dùng, còn backend tập trung vào xử lý Excel và tính toán. Cách tổ chức này giúp hệ thống dễ mở rộng, dễ bảo trì và có thể thay đổi giao diện mà không ảnh hưởng nhiều đến logic tính công.

## Chương 5. Thiết kế dữ liệu

### 5.1. Dữ liệu đầu vào

Dữ liệu đầu vào là file Excel xuất từ hệ thống chấm công. File thường gồm nhiều dòng, trong đó mỗi nhân viên được thể hiện bằng một block. Trong block có thông tin mã nhân viên, tên nhân viên, hàng chứa giờ bấm, hàng chứa kết quả công, hàng chứa quên bấm và hàng chứa đi trễ.

Một ô ngày công có thể chứa nhiều mốc giờ, ví dụ:

07:22 11:31 13:00 17:01 17:30 17:45 22:00

Hệ thống cần trích các mốc này thành danh sách có thứ tự để xử lý.

### 5.2. Dữ liệu trung gian

Sau khi đọc file, hệ thống tạo dữ liệu trung gian gồm:

- Mã nhân viên.
- Sheet chứa dữ liệu.
- Vị trí hàng, cột trong workbook.
- Ngày trong tháng.
- Giá trị gốc của ô chấm công.
- Danh sách giờ bấm.
- Kết quả công tính được.
- Số lần nghi quên bấm.
- Số phút đi trễ.
- Danh sách ghi chú cần kiểm tra.

### 5.3. Dữ liệu đầu ra

Dữ liệu đầu ra gồm:

- File Excel đã ghi kết quả công.
- Danh sách dòng cần kiểm tra trên giao diện.
- Dữ liệu lịch sử kỳ công nếu người dùng lưu.
- Dữ liệu bảng lương nếu người dùng sử dụng chức năng payroll.

### 5.4. Dữ liệu lịch sử

Lịch sử được lưu bằng SQLite. Mỗi kỳ công có thông tin tháng, năm, thời điểm lưu, số block nhân viên, số dòng đã tính, số dòng đi trễ và số dòng cần kiểm tra.

Dữ liệu chi tiết theo ngày gồm:

- Mã nhân viên.
- Ngày.
- Chuỗi giờ bấm.
- Công đã tính.
- Quên bấm.
- Phút trễ.
- Ghi chú kiểm tra.
- Ghi chú chỉnh sửa của người dùng.

### 5.5. Dữ liệu lương

Dữ liệu lương gồm:

- Mã nhân viên.
- Tên nhân viên.
- Lương tháng hoặc thông tin tính lương.
- Lương ngày.
- Lương giờ.
- Các thông tin hỗ trợ xuất bảng lương.

Từ dữ liệu công và dữ liệu lương, hệ thống có thể tính các chỉ số như tổng giờ, ngày công, lương theo công và lương cuối kỳ.

### 5.6. Sơ đồ dữ liệu đề xuất

Hình 5.1. Sơ đồ dữ liệu mức khái niệm

Mô tả:

- Bảng Period lưu kỳ công.
- Bảng AttendanceRecord lưu dữ liệu ngày công của nhân viên trong kỳ.
- Bảng EmployeePayroll lưu thông tin lương của nhân viên.
- Period có quan hệ một nhiều với AttendanceRecord.
- EmployeePayroll liên kết với AttendanceRecord thông qua mã nhân viên.

## Chương 6. Thiết kế bộ rules chấm công

### 6.1. Nguyên tắc xây dựng rules

Bộ rules được xây dựng dựa trên dữ liệu thực tế và quy định ca làm việc. Mục tiêu không phải là ép mọi dữ liệu thành một kết quả chắc chắn, mà là phân loại dữ liệu thành hai nhóm:

- Nhóm chắc chắn: hệ thống có thể tính tự động.
- Nhóm mập mờ: hệ thống tính phần có thể tính nhưng gắn dấu cần kiểm tra.

### 6.2. Các khung ca cơ bản

| Ca | Khung giờ chuẩn | Công tối đa |
| --- | --- | --- |
| Ca sáng | 07:30 - 11:30 | 4 giờ |
| Ca chiều | 13:00 - 17:00 | 4 giờ |
| Ca tối | 18:00 - 22:00 | 4 giờ |
| Ca thêm trước tối | Khoảng 17:00 trở đi | Tùy tình huống |

### 6.3. Rule bấm trùng

Các mốc bấm sát nhau trong vòng 5 phút được xem như một cụm. Mục đích là tránh trường hợp người dùng bấm nhiều lần liên tiếp hoặc máy ghi nhận lặp làm hệ thống hiểu nhầm là ra vào giữa giờ.

Ví dụ:

| Dữ liệu gốc | Cách hiểu |
| --- | --- |
| 07:30, 07:32, 11:30 | 07:30 và 07:32 được xem là một lần vào |
| 17:30, 17:32, 22:00 | 17:30 và 17:32 không bị hiểu là ra vào riêng |

### 6.4. Rule ca sáng

Nếu có mốc vào trước hoặc gần 07:30 và có mốc ra từ 11:30 trở đi, hệ thống tính đủ 4 giờ sáng. Nếu có vào sáng nhưng thiếu giờ ra sáng, hệ thống có thể báo quên bấm hoặc đưa vào kiểm tra.

Ví dụ:

| Giờ bấm | Kết quả |
| --- | --- |
| 07:22, 11:31 | 4 giờ sáng |
| 07:45, 11:30 | Có thể ghi nhận đi trễ 15 phút |
| 07:30 | Không đủ cặp giờ, cần kiểm tra |

### 6.5. Rule vùng 12:00 - 12:10

Vùng 12:00 - 12:10 dễ gây xung đột vì có thể là ra trưa hoặc vào chiều. Hệ thống ưu tiên xem đây là giờ ra trưa nếu trước đó đã có giờ vào sáng. Cách này giúp tránh tính nhầm một người chỉ ra trưa hơi muộn thành người vào ca chiều.

### 6.6. Rule ca chiều

Mốc từ 12:00 đến 15:00 có thể được nhận là giờ vào chiều, nhưng phải xét ngữ cảnh. Nếu nhân viên đã có ca sáng và mốc nằm trong 12:00 - 12:10 thì không tính là vào chiều. Nếu có mốc 13:00 và làm đến 17:00, hệ thống tính 4 giờ chiều.

Ví dụ:

| Giờ bấm | Kết quả |
| --- | --- |
| 13:00, 17:01 | 4 giờ chiều |
| 13:15, 17:00 | Có thể ghi nhận đi trễ 15 phút |
| 12:05 sau ca sáng | Ưu tiên xem là ra trưa |

### 6.7. Rule ca tối

Ca tối chuẩn là 18:00 - 22:00. Nếu có mốc vào tối và ra tối, hệ thống tính công tối. Nếu có mốc bấm sớm trước 18:00 nhưng không có ca chiều, hệ thống có thể xem là ca tối trực tiếp trong một số trường hợp. Đây là rule cần thận trọng vì dễ nhầm giữa bấm sớm và làm thêm.

Ví dụ:

| Giờ bấm | Cách xử lý hiện tại |
| --- | --- |
| 18:00, 22:00 | 4 giờ tối |
| 17:50, 22:00 | Có thể tính 4 giờ tối từ 18:00 |
| 17:22, 22:00 | Hiện tại có thể bị xem là ca tối trực tiếp, đây là mép rule cần kiểm tra nghiệp vụ |

### 6.8. Rule chiều nối tối

Nếu nhân viên có vào chiều và làm liên tục đến tối, hệ thống cần tính cả công chiều và công tối. Ví dụ 13:00, 22:00 có thể được hiểu là làm từ chiều qua tối, không phải chỉ làm ca chiều.

Tuy nhiên, nếu có mốc ra chiều rồi vào lại tối, hệ thống cần tách ca thay vì xem là làm liên tục.

### 6.9. Rule ra chiều rồi vào lại tối

Một số chuỗi giờ có dạng:

13:00, 17:30, 17:45, 22:00

Trong trường hợp này, 17:30 có thể là kết thúc phần chiều hoặc phần làm thêm, 17:45 là vào lại ca tối, 22:00 là ra tối. Hệ thống tách phần chiều và phần tối để tính hợp lý.

### 6.10. Rule vùng 17:00 - 18:00

Vùng 17:00 - 18:00 là vùng phức tạp nhất trong hệ thống vì nằm giữa ca chiều và ca tối. Một mốc trong vùng này có thể mang nhiều ý nghĩa:

- Ra ca chiều.
- Làm thêm sau ca chiều.
- Bấm sớm ca tối.
- Vào lại ca tối.
- Bấm nhầm hoặc bấm trùng.

Các vùng nhỏ hiện tại:

| Vùng giờ | Cách hiểu nghiệp vụ |
| --- | --- |
| 16:45 - 17:07 | Có thể là ca thêm từ 17:00 hoặc bấm sớm |
| 17:08 - 17:15 | Mập mờ, gắn cần kiểm tra |
| 17:15 - 17:24 | Có thể tính thêm chiều khoảng 4.25 giờ |
| 17:25 - 17:32 | Có thể tính thêm chiều khoảng 4.5 giờ |
| 17:33 - trước 17:40 | Đáng nghi, gắn cần kiểm tra |
| 17:40 - 18:15 | Có thể là vào lại ca tối |

### 6.11. Ví dụ hai case sát nhau

Hai chuỗi sau chỉ khác nhau 3 phút nhưng kết quả cảnh báo khác nhau:

| Chuỗi giờ | Kết quả hiện tại |
| --- | --- |
| 07:22, 11:31, 13:00, 17:01, 17:33, 17:45, 22:00 | 12.5 giờ, có dấu ? cần kiểm tra |
| 07:22, 11:31, 13:00, 17:01, 17:30, 17:45, 22:00 | 12.5 giờ, không có dấu ? |

Lý do: 17:33 nằm trong vùng suspicious, còn 17:30 vẫn nằm trong vùng extra được hệ thống chấp nhận là bình thường.

### 6.12. Rule đi trễ

Hệ thống phát hiện đi trễ theo từng ca:

- Ca sáng: sau 07:30.
- Ca chiều: sau 13:00.
- Ca tối: sau 18:00 nếu không có ca chiều.
- Ca thêm 17:00: một số trường hợp bắt đầu từ 17:00.

Phút trễ được tính khi không có mốc bấm trước hoặc đúng giờ bắt đầu ca. Cửa sổ phát hiện trễ hiện tại cho phép trễ trong khoảng 120 phút sau giờ bắt đầu.

### 6.13. Rule phạt trễ

Phạt trễ được làm tròn theo block 30 phút. Nếu phần dư trên 8 phút, hệ thống làm tròn thêm một block. Ví dụ:

| Phút trễ | Phút phạt |
| --- | --- |
| 5 phút | 0 phút |
| 10 phút | 30 phút |
| 30 phút | 30 phút |
| 39 phút | 60 phút |

### 6.14. Rule ra vào giữa giờ

Nếu giữa một ca có cặp ra vào kéo dài từ 15 phút trở lên, hệ thống xem là ra ngoài giữa giờ và đưa vào danh sách cần kiểm tra. Đồng thời, hệ thống có thể tính phần trừ công theo block phạt.

Ví dụ:

| Giờ bấm | Cách hiểu |
| --- | --- |
| 07:30, 09:00, 09:30, 11:30 | Ra ngoài 30 phút trong ca sáng |
| 13:00, 15:00, 15:20, 17:00 | Ra ngoài 20 phút trong ca chiều |

### 6.15. Rule quên bấm

Các trường hợp quên bấm gồm:

- Chỉ có một lần bấm.
- Có vào sáng nhưng không có ra sáng.
- Có ra sáng và ra chiều nhưng không có vào chiều.
- Có vào chiều nhưng không có ra chiều hoặc ra tối.
- Có vào tối nhưng không có ra tối.
- Có dữ liệu mập mờ không đủ cơ sở kết luận.

### 6.16. Rule cảnh báo ca tối dư phút

Ca tối có làm tròn giờ. Tuy nhiên, nếu phần dư sau làm tròn vượt ngưỡng lớn, hệ thống không âm thầm cộng mà gắn cảnh báo. Điều này giúp phát hiện các trường hợp bấm nhầm hoặc dữ liệu tối bất thường.

### 6.17. Rule chồng rule và cách tránh xung đột

Trong hệ thống có nhiều rule có thể cùng áp dụng lên một mốc giờ. Ví dụ, 17:30 có thể là ra chiều, làm thêm, hoặc chuẩn bị vào tối. Để tránh tính hai lần, hệ thống dùng các điều kiện loại trừ.

Các tình huống chồng rule đã được xử lý:

| Xung đột | Cách xử lý |
| --- | --- |
| 12:00 - 12:10 là ra trưa hay vào chiều | Nếu có ca sáng, ưu tiên ra trưa |
| Có ca chiều nhưng có mốc sau 18:00 | Không tự phạt trễ ca tối |
| Chiều nối tối hay ra chiều rồi vào tối | Có cặp split thì tách, không có thì xem nối |
| Bấm trùng hay ra vào giữa giờ | Gộp bấm trùng trước khi xét gap |
| Một mốc tối lẻ | Không tính bừa, đưa vào kiểm tra |
| Split bình thường hay split đáng nghi | 17:33 trở đi gắn kiểm tra |

## Chương 7. Giải thích xử lý code theo chức năng

### 7.1. Nguyên tắc giải thích

Phần này không trình bày mã nguồn chi tiết, mà giải thích vai trò của các module trong hệ thống. Mục tiêu là giúp người đọc hiểu luồng xử lý và trách nhiệm của từng phần.

### 7.2. Module xử lý giờ bấm

Module tách giờ bấm có nhiệm vụ nhận một giá trị từ ô Excel và tìm tất cả chuỗi có dạng giờ phút. Sau khi lấy được danh sách mốc giờ, hệ thống loại bỏ dữ liệu không phải thời gian và sắp xếp các mốc theo thứ tự tăng dần.

Ví dụ, nếu ô Excel chứa:

07:22 11:31 13:00 17:01 17:30 17:45 22:00

Hệ thống chuyển thành danh sách bảy mốc giờ. Danh sách này là đầu vào cho bộ tính công.

### 7.3. Module phát hiện block nhân viên

File chấm công có nhiều block, mỗi block tương ứng với một nhân viên. Module phát hiện block xác định các vị trí quan trọng như:

- Hàng tiêu đề ngày.
- Hàng mã nhân viên.
- Hàng chứa giờ bấm.
- Hàng quên bấm.
- Hàng đi trễ.
- Hàng kết quả công.

Nhờ xác định đúng block, hệ thống biết cần đọc ô nào và ghi kết quả về đâu.

### 7.4. Module xử lý workbook

Module xử lý workbook là phần điều phối chính khi phân tích file Excel. Nó mở workbook, chọn sheet phù hợp, duyệt qua từng block nhân viên và từng ngày trong tháng. Với mỗi ô chấm công, module gọi bộ parser để tách giờ bấm, sau đó gọi calculator để tính kết quả.

Kết quả cuối cùng được gom thành dữ liệu trả về frontend, gồm danh sách nhân viên, danh sách ngày công và danh sách dòng cần kiểm tra.

### 7.5. Module tính công

Module tính công là phần quan trọng nhất của hệ thống. Nó nhận danh sách giờ bấm trong một ngày và trả về:

- Giá trị công.
- Số lần nghi quên bấm.
- Số phút đi trễ.
- Danh sách ghi chú cần kiểm tra.

Module này chứa các rule nghiệp vụ như ca sáng, ca chiều, ca tối, ca thêm, split chiều tối, đi trễ, quên bấm, bấm trùng và ra vào giữa giờ.

### 7.6. Quy trình tính một ngày công

Quy trình xử lý một ngày công có thể mô tả như sau:

1. Nhận danh sách giờ bấm.
2. Sắp xếp và loại bỏ mốc trùng.
3. Xác định dấu hiệu ca sáng.
4. Xác định dấu hiệu ca chiều.
5. Xác định dấu hiệu ca tối.
6. Kiểm tra các trường hợp split chiều tối.
7. Kiểm tra các trường hợp mập mờ.
8. Tính giờ công chắc chắn.
9. Tính phút trễ nếu có.
10. Tính trừ công nếu có ra vào giữa giờ hoặc phạt trễ.
11. Trả kết quả cho workbook processor.

### 7.7. Module chuẩn hóa workbook

Trong thực tế, file Excel đầu vào có thể không hoàn toàn đúng mẫu. Module chuẩn hóa workbook hỗ trợ đưa file về dạng dễ xử lý hơn, ví dụ chỉnh lại cấu trúc hàng cột hoặc định dạng cần thiết để hệ thống đọc đúng.

### 7.8. Module tính lại tổng công

Sau khi người dùng chỉnh sửa kết quả trong file, hệ thống có chức năng tính lại tổng công. Module này đọc workbook đã chỉnh và cập nhật lại các tổng hợp cần thiết. Chức năng này hữu ích khi người dùng muốn chỉnh thủ công nhưng vẫn cần hệ thống hỗ trợ tổng hợp.

### 7.9. Module lưu lịch sử

Module lịch sử dùng SQLite để lưu lại kỳ công đã xử lý. Khi người dùng lưu kỳ công, hệ thống ghi thông tin kỳ, danh sách nhân viên, dữ liệu từng ngày và các ghi chú kiểm tra. Khi cần tra cứu, hệ thống đọc lại dữ liệu từ SQLite và trả về frontend.

### 7.10. Module bảng lương

Module bảng lương quản lý thông tin lương nhân viên và tính các giá trị liên quan. Từ tổng giờ công hoặc ngày công, hệ thống có thể quy đổi sang tiền lương dựa trên lương ngày hoặc lương giờ. Điều này giúp liên kết dữ liệu chấm công với nghiệp vụ tính lương.

## Chương 8. Giải thích thư viện và công nghệ sử dụng

### 8.1. Python

Python được sử dụng cho backend vì có hệ sinh thái mạnh trong xử lý file, dữ liệu và API. Python dễ đọc, phù hợp để viết các rule nghiệp vụ phức tạp, đồng thời có nhiều thư viện hỗ trợ Excel, cơ sở dữ liệu và web service.

### 8.2. FastAPI

FastAPI là framework xây dựng API cho Python. Hệ thống sử dụng FastAPI để tạo các endpoint như phân tích chấm công, xuất file, lưu lịch sử và quản lý lương.

Ưu điểm:

- Tốc độ xử lý tốt.
- Cấu trúc rõ ràng.
- Hỗ trợ khai báo dữ liệu request và response.
- Phù hợp với ứng dụng frontend - backend.

### 8.3. Uvicorn

Uvicorn là server dùng để chạy ứng dụng FastAPI. Nó nhận request từ frontend và chuyển vào ứng dụng backend xử lý.

### 8.4. Openpyxl

Openpyxl là thư viện quan trọng trong hệ thống vì dùng để đọc và ghi file Excel. Hệ thống dùng openpyxl để:

- Mở workbook.
- Đọc giá trị ô.
- Tìm sheet và block dữ liệu.
- Ghi kết quả công vào file.
- Giữ định dạng, font, màu, căn lề và border.
- Xuất workbook sau xử lý.

Openpyxl phù hợp vì dữ liệu đầu vào và đầu ra đều là file Excel.

### 8.5. Pandas

Pandas là thư viện xử lý dữ liệu dạng bảng. Trong hệ thống, pandas có thể hỗ trợ các thao tác tổng hợp, phân tích hoặc xử lý dữ liệu dạng bảng khi cần. Dù phần xử lý workbook chính dùng openpyxl, pandas vẫn hữu ích cho các thao tác phân tích dữ liệu lớn hơn.

### 8.6. SQLite

SQLite là cơ sở dữ liệu nhẹ, lưu trữ trong file cục bộ. Hệ thống dùng SQLite để lưu lịch sử kỳ công và dữ liệu liên quan. Lý do chọn SQLite:

- Không cần cài đặt server cơ sở dữ liệu riêng.
- Phù hợp với ứng dụng nội bộ hoặc portable.
- Dễ sao lưu vì dữ liệu nằm trong một file.
- Đủ đáp ứng nhu cầu lưu lịch sử chấm công.

### 8.7. React

React được dùng để xây dựng giao diện người dùng. Với React, giao diện có thể cập nhật linh hoạt theo trạng thái dữ liệu, ví dụ sau khi upload file, sau khi nhận kết quả phân tích hoặc sau khi người dùng chỉnh sửa.

### 8.8. TypeScript

TypeScript giúp frontend có kiểu dữ liệu rõ ràng hơn JavaScript thuần. Điều này hữu ích vì dữ liệu chấm công có nhiều trường như mã nhân viên, ngày, công, phút trễ, ghi chú, lịch sử và thông tin lương.

### 8.9. Vite

Vite là công cụ phát triển frontend. Nó giúp chạy ứng dụng React nhanh, hỗ trợ build và phục vụ quá trình phát triển giao diện.

### 8.10. Axios

Axios được dùng để gửi request từ frontend đến backend. Ví dụ, frontend dùng Axios để upload file chấm công, gọi API lưu kỳ công, lấy danh sách lịch sử và cập nhật dữ liệu.

### 8.11. MUI và AG Grid

MUI hỗ trợ xây dựng giao diện hiện đại với các thành phần có sẵn. AG Grid hỗ trợ hiển thị dữ liệu bảng lớn, phù hợp với dữ liệu chấm công nhiều nhân viên và nhiều ngày.

## Chương 9. Thiết kế giao diện

### 9.1. Mục tiêu giao diện

Giao diện được thiết kế để người dùng không cần đọc toàn bộ file Excel bằng mắt. Thay vào đó, hệ thống hiển thị kết quả tổng hợp, bảng chi tiết và danh sách cần kiểm tra. Người dùng tập trung vào các dòng có vấn đề thay vì kiểm tra mọi ô.

### 9.2. Màn hình tải file

Màn hình tải file cho phép người dùng chọn file Excel chấm công. Sau khi chọn file, người dùng bấm phân tích để gửi file lên backend. Hệ thống hiển thị trạng thái đang xử lý và trả kết quả khi hoàn thành.

### 9.3. Màn hình kết quả phân tích

Sau khi phân tích, giao diện hiển thị các chỉ số tổng quan như:

- Số dòng đã tính công.
- Số ô có đi trễ.
- Số ô quên bấm hoặc chưa rõ.
- Số dòng cần kiểm tra thủ công.

Các chỉ số này giúp người dùng nắm nhanh chất lượng dữ liệu trong file.

### 9.4. Bảng nhân viên và ngày công

Giao diện cho phép chọn từng nhân viên để xem chi tiết ngày công. Mỗi ngày có thể hiển thị:

- Giờ bấm gốc.
- Công tính được.
- Số lần quên bấm.
- Phút trễ.
- Ghi chú kiểm tra.

### 9.5. Panel cần kiểm tra

Panel cần kiểm tra là điểm quan trọng trong giao diện. Tất cả trường hợp hệ thống không chắc chắn được gom về đây. Ví dụ:

- Có dấu hiệu ra chiều sát ca tối.
- Giờ vào 17:08 - 17:15 chưa rõ.
- Có một mốc tối nhưng thiếu cặp vào ra.
- Có dấu hiệu ra vào giữa giờ công.
- Không đủ cặp giờ để tính công.

Nhờ panel này, người dùng không phải tự lọc toàn bộ bảng.

### 9.6. Màn hình chỉnh sửa

Người dùng có thể chỉnh lại kết quả khi phát hiện hệ thống chưa đúng nghiệp vụ thực tế. Các trường có thể chỉnh gồm:

- Công.
- Quên bấm.
- Phút trễ.
- Ghi chú.

Việc cho phép chỉnh sửa giúp hệ thống phù hợp với thực tế, vì một số trường hợp chỉ người quản lý hoặc nhân sự mới biết chính xác.

### 9.7. Màn hình lịch sử

Màn hình lịch sử cho phép lưu và xem lại các kỳ công đã xử lý. Người dùng có thể tra cứu theo tháng, năm hoặc mã nhân viên. Chức năng này giúp doanh nghiệp có cơ sở đối chiếu khi cần kiểm tra lại dữ liệu cũ.

### 9.8. Màn hình tổng quan

Màn hình tổng quan hiển thị dữ liệu công theo thời gian. Ví dụ có thể xem số ngày công theo từng tháng của một nhân viên, số lỗi đi trễ hoặc số trường hợp cần kiểm tra. Đây là cơ sở để quản lý theo dõi xu hướng chuyên cần.

### 9.9. Đánh giá giao diện hiện tại

Giao diện hiện tại đi theo hướng bảng kiểm lỗi. Hệ thống không cố giải thích mọi rule bằng timeline trực quan, mà tập trung vào kết quả và các dòng cần kiểm tra. Cách này phù hợp với mục tiêu sử dụng thực tế vì nhân sự cần xử lý nhanh file công hàng tháng.

Điểm có thể phát triển thêm là xây dựng timeline cho từng ngày công. Timeline sẽ giúp nhìn trực quan các mốc 07:22, 11:31, 13:00, 17:33, 17:45, 22:00 đang được hệ thống hiểu là vào/ra ca nào.

## Chương 10. Biểu đồ, bảng và sơ đồ minh họa

### 10.1. Sơ đồ quy trình xử lý file

Hình 10.1. Quy trình xử lý file chấm công

Mô tả:

Người dùng tải file -> Backend đọc workbook -> Phát hiện block nhân viên -> Tách giờ bấm -> Áp dụng rules -> Tính công -> Gắn cảnh báo -> Trả kết quả -> Người dùng chỉnh sửa -> Xuất file hoặc lưu lịch sử.

### 10.2. Sơ đồ activity xử lý một ngày công

Hình 10.2. Activity xử lý một ngày công

Mô tả:

Bắt đầu từ danh sách giờ bấm. Nếu danh sách rỗng thì bỏ qua. Nếu có dữ liệu, hệ thống kiểm tra ca sáng, ca chiều, ca tối, kiểm tra đi trễ, kiểm tra quên bấm, kiểm tra mập mờ, sau đó trả về kết quả công và ghi chú.

### 10.3. Sơ đồ sequence upload file

Hình 10.3. Sequence upload file

Mô tả:

Frontend gửi file tới API phân tích. API gọi workbook processor. Workbook processor gọi block detector, punch parser và attendance calculator. Sau khi tính xong, API trả response cho frontend. Frontend hiển thị bảng kết quả.

### 10.4. Biểu đồ cột số dòng cần kiểm tra theo loại lỗi

Bảng dữ liệu minh họa:

| Loại lỗi | Số dòng |
| --- | --- |
| Quên bấm | 18 |
| Đi trễ | 12 |
| Ra vào giữa giờ | 5 |
| Sát ca tối | 9 |
| Một mốc tối | 4 |

Khi vẽ biểu đồ, trục ngang là loại lỗi, trục dọc là số dòng. Biểu đồ này giúp quản lý biết nhóm lỗi nào xuất hiện nhiều nhất.

### 10.5. Biểu đồ đường ngày công theo tháng

Bảng dữ liệu minh họa:

| Tháng | Ngày công |
| --- | --- |
| 1 | 24 |
| 2 | 22 |
| 3 | 25 |
| 4 | 23 |
| 5 | 24 |
| 6 | 26 |
| 7 | 25 |
| 8 | 24 |
| 9 | 23 |
| 10 | 25 |
| 11 | 24 |
| 12 | 26 |

Biểu đồ đường giúp theo dõi xu hướng công của nhân viên trong năm.

### 10.6. Bảng heatmap vùng giờ phức tạp

| Vùng giờ | Độ rủi ro | Ghi chú |
| --- | --- | --- |
| 12:00 - 12:10 | Trung bình | Ra trưa hoặc vào chiều |
| 16:45 - 17:07 | Trung bình | Có thể là ca thêm |
| 17:08 - 17:15 | Cao | Mập mờ giữa ca thêm và bấm sớm |
| 17:16 - 17:39 | Cao | Sát ca tối, dễ bị hiểu nhầm |
| 17:40 - 18:15 | Trung bình | Có thể là vào lại ca tối |
| 21:30 - 22:30 | Thấp | Thường là giờ ra tối |

### 10.7. Bảng so sánh trước và sau khi dùng hệ thống

| Tiêu chí | Trước khi có hệ thống | Sau khi có hệ thống |
| --- | --- | --- |
| Cách đọc file | Đọc thủ công từng dòng | Hệ thống tự đọc và tách giờ |
| Tính công | Tính tay hoặc công thức rời rạc | Tính bằng rules thống nhất |
| Phát hiện lỗi | Phụ thuộc người kiểm tra | Tự gom danh sách cần kiểm tra |
| Lưu lịch sử | Phân tán theo file | Có dữ liệu lịch sử tập trung |
| Tính lương | Dễ phải nhập lại | Có liên kết với dữ liệu công |
| Kiểm tra lại | Mất thời gian tìm file | Tra cứu theo kỳ và nhân viên |

## Chương 11. Kiểm thử hệ thống

### 11.1. Mục tiêu kiểm thử

Kiểm thử nhằm xác nhận hệ thống xử lý đúng các ca thông thường và nhận diện được các ca phức tạp. Do dữ liệu chấm công ảnh hưởng trực tiếp đến lương, kiểm thử không chỉ quan tâm hệ thống có chạy hay không, mà còn phải quan tâm kết quả nghiệp vụ có hợp lý hay không.

### 11.2. Nhóm test ca thông thường

| Mã test | Dữ liệu giờ bấm | Kết quả mong đợi |
| --- | --- | --- |
| TC01 | 07:30, 11:30 | 4 giờ sáng |
| TC02 | 13:00, 17:00 | 4 giờ chiều |
| TC03 | 18:00, 22:00 | 4 giờ tối |
| TC04 | 07:30, 11:30, 13:00, 17:00 | 8 giờ ngày |

### 11.3. Nhóm test đi trễ

| Mã test | Dữ liệu giờ bấm | Kết quả mong đợi |
| --- | --- | --- |
| TC05 | 07:45, 11:30 | Trễ sáng 15 phút |
| TC06 | 13:20, 17:00 | Trễ chiều 20 phút |
| TC07 | 18:15, 22:00 | Trễ tối 15 phút nếu không có ca chiều |

### 11.4. Nhóm test quên bấm

| Mã test | Dữ liệu giờ bấm | Kết quả mong đợi |
| --- | --- | --- |
| TC08 | 07:30 | Không đủ cặp giờ, cần kiểm tra |
| TC09 | 22:00 | Một mốc tối, cần kiểm tra |
| TC10 | 07:30, 13:00, 17:00 | Có thể thiếu ra sáng |

### 11.5. Nhóm test vùng chiều tối

| Mã test | Dữ liệu giờ bấm | Kết quả hiện tại |
| --- | --- | --- |
| TC11 | 13:00, 17:30, 17:45, 22:00 | Tách chiều và tối |
| TC12 | 13:00, 17:33, 17:45, 22:00 | Gắn cần kiểm tra |
| TC13 | 17:08, 22:00 | Gắn cần kiểm tra vì mốc 17:08 - 17:15 |
| TC14 | 17:22, 22:00 | Hiện tại có thể tính như ca tối trực tiếp, cần xem lại nghiệp vụ |

### 11.6. Nhóm test ra vào giữa giờ

| Mã test | Dữ liệu giờ bấm | Kết quả mong đợi |
| --- | --- | --- |
| TC15 | 07:30, 09:00, 09:30, 11:30 | Cảnh báo ra vào giữa giờ, trừ 30 phút |
| TC16 | 13:00, 15:00, 15:10, 17:00 | Không nhất thiết trừ nếu dưới ngưỡng |
| TC17 | 18:00, 20:00, 20:30, 22:00 | Cảnh báo ra vào giữa ca tối |

### 11.7. Đánh giá kết quả kiểm thử

Các test ca thông thường giúp xác nhận hệ thống tính đúng công cơ bản. Các test đi trễ và quên bấm giúp xác nhận hệ thống nhận diện lỗi phổ biến. Nhóm test vùng chiều tối là quan trọng nhất vì đây là vùng có nhiều rule chồng nhau và dễ phát sinh sai lệch nghiệp vụ.

Qua phân tích, hệ thống hiện tại đã xử lý được nhiều trường hợp phức tạp, đặc biệt là tách chiều tối, gắn cảnh báo vùng 17:33 và xử lý mốc 17:08 - 17:15. Tuy nhiên, vẫn còn một số mép rule cần cân nhắc thêm, ví dụ cặp 17:22, 22:00 có thể cần được gắn kiểm tra thay vì tính sạch như ca tối trực tiếp.

## Chương 12. Đánh giá hệ thống

### 12.1. Ưu điểm

Hệ thống có các ưu điểm chính:

- Tự động đọc và xử lý file Excel chấm công.
- Giảm thời gian kiểm tra thủ công.
- Có bộ rules rõ ràng cho các ca sáng, chiều, tối.
- Phát hiện được quên bấm, đi trễ và nhiều trường hợp mập mờ.
- Có danh sách cần kiểm tra giúp người dùng tập trung vào dòng bất thường.
- Cho phép chỉnh sửa kết quả trước khi xuất file.
- Có chức năng lưu lịch sử và tra cứu.
- Có liên kết với nghiệp vụ tính lương.
- Sử dụng công nghệ phổ biến, dễ bảo trì.

### 12.2. Hạn chế

Một số hạn chế hiện tại:

- Rules vẫn phụ thuộc vào mẫu dữ liệu và quy định ca của công ty.
- Một số vùng giờ sát ranh giới ca vẫn cần người dùng kiểm tra.
- Giao diện chưa có timeline trực quan cho từng ngày công.
- Hệ thống chưa kết nối trực tiếp với máy chấm công.
- Chưa có cơ chế học từ quyết định chỉnh sửa của người dùng.
- Một số tình huống nghiệp vụ đặc biệt có thể cần bổ sung rule.

### 12.3. Rủi ro nghiệp vụ

Rủi ro lớn nhất là tính sai công trong trường hợp dữ liệu mập mờ. Để giảm rủi ro, hệ thống chọn cách gắn dấu cần kiểm tra thay vì tự động kết luận. Đây là hướng thiết kế phù hợp vì dữ liệu chấm công ảnh hưởng đến tiền lương.

### 12.4. Giá trị thực tế

Giá trị thực tế của hệ thống nằm ở việc chuyển công việc chấm công từ kiểm tra thủ công toàn bộ sang kiểm tra có trọng tâm. Người dùng không phải đọc hết mọi dòng, mà chỉ cần xử lý các dòng hệ thống đánh dấu. Điều này tiết kiệm thời gian và giảm sai sót.

## Chương 13. Hướng phát triển

### 13.1. Bổ sung timeline trực quan

Hệ thống có thể thêm timeline cho từng ngày công. Timeline hiển thị các mốc giờ trên trục thời gian và tô màu theo ca sáng, ca chiều, ca tối. Nhờ đó, người dùng nhìn nhanh được mốc nào là vào, mốc nào là ra, mốc nào đang gây mập mờ.

### 13.2. Hiển thị đường đi suy luận của rules

Hiện tại giao diện chủ yếu hiển thị kết quả và ghi chú. Có thể phát triển thêm phần giải thích vì sao hệ thống tính ra kết quả đó. Ví dụ:

- 07:22 được nhận là vào sáng.
- 11:31 được nhận là ra sáng.
- 13:00 được nhận là vào chiều.
- 17:33 nằm trong vùng sát ca tối nên cần kiểm tra.
- 17:45 được nhận là vào lại ca tối.
- 22:00 được nhận là ra tối.

### 13.3. Cho phép cấu hình rules

Thay vì cố định các mốc giờ trong hệ thống, có thể xây dựng màn hình cấu hình:

- Giờ bắt đầu và kết thúc ca.
- Ngưỡng bấm trùng.
- Ngưỡng đi trễ.
- Ngưỡng làm tròn.
- Vùng giờ cần cảnh báo.

Điều này giúp hệ thống phù hợp với nhiều công ty hơn.

### 13.4. Kết nối máy chấm công

Trong tương lai, hệ thống có thể kết nối trực tiếp với máy chấm công hoặc API của phần mềm chấm công. Khi đó, người dùng không cần xuất file thủ công.

### 13.5. Học từ chỉnh sửa của người dùng

Nếu người dùng thường xuyên chỉnh một loại case theo cùng một cách, hệ thống có thể ghi nhận để đề xuất rule mới. Ví dụ, nếu mọi trường hợp 17:22, 22:00 đều được người dùng xem là bấm sớm ca tối, hệ thống có thể gắn cảnh báo mặc định.

### 13.6. Phân quyền người dùng

Có thể bổ sung phân quyền:

- Nhân sự được upload và chỉnh công.
- Kế toán được xem bảng lương.
- Quản lý được xem báo cáo tổng quan.
- Admin được cấu hình rules.

### 13.7. Báo cáo thống kê nâng cao

Hệ thống có thể bổ sung các báo cáo:

- Top nhân viên đi trễ nhiều nhất.
- Số lần quên bấm theo tháng.
- Tỷ lệ ngày công hợp lệ.
- Số dòng cần kiểm tra theo loại lỗi.
- Biểu đồ xu hướng chuyên cần theo phòng ban.

## Chương 14. Kết luận

Đề tài đã xây dựng một hệ thống xử lý dữ liệu chấm công từ file Excel, đáp ứng nhu cầu thực tế của doanh nghiệp trong việc tự động hóa quá trình tính công và phát hiện lỗi. Hệ thống sử dụng backend Python FastAPI để xử lý nghiệp vụ, frontend React để hiển thị giao diện, openpyxl để đọc ghi Excel và SQLite để lưu lịch sử.

Điểm nổi bật của hệ thống là bộ rules xử lý dữ liệu chấm công. Bộ rules không chỉ tính ca sáng, ca chiều, ca tối, mà còn xử lý nhiều tình huống phức tạp như bấm trùng, quên bấm, đi trễ, ra vào giữa giờ, chiều nối tối, ra chiều rồi vào lại tối và các mốc giờ sát ca tối. Những trường hợp không chắc chắn được đưa vào danh sách cần kiểm tra, giúp người dùng kiểm soát rủi ro trước khi xuất kết quả.

Về mặt thực tiễn, hệ thống giúp giảm thời gian xử lý bảng công, tăng tính nhất quán trong tính toán và hỗ trợ lưu trữ lịch sử. Hệ thống không thay thế hoàn toàn người phụ trách nhân sự, mà đóng vai trò công cụ hỗ trợ để người dùng xử lý nhanh hơn, chính xác hơn và có cơ sở kiểm tra rõ ràng hơn.

Trong tương lai, hệ thống có thể được phát triển thêm các chức năng như timeline trực quan, cấu hình rules, kết nối trực tiếp máy chấm công, phân quyền người dùng và báo cáo thống kê nâng cao. Những hướng phát triển này sẽ giúp hệ thống hoàn thiện hơn và phù hợp với nhiều mô hình doanh nghiệp khác nhau.

## Tài liệu tham khảo

| STT | Tài liệu / Công nghệ | Nội dung tham khảo |
| --- | --- | --- |
| 1 | Tài liệu Python | Cú pháp ngôn ngữ, xử lý file, cấu trúc dữ liệu |
| 2 | Tài liệu FastAPI | Xây dựng API, khai báo route, xử lý upload file |
| 3 | Tài liệu Openpyxl | Đọc, ghi và định dạng file Excel |
| 4 | Tài liệu SQLite | Lưu trữ dữ liệu cục bộ, truy vấn lịch sử |
| 5 | Tài liệu React | Xây dựng giao diện theo component |
| 6 | Tài liệu TypeScript | Kiểu dữ liệu cho frontend |
| 7 | Tài liệu Vite | Khởi tạo và build ứng dụng frontend |
| 8 | Tài liệu Axios | Gửi request HTTP từ frontend đến backend |
| 9 | Tài liệu MUI | Thành phần giao diện người dùng |
| 10 | Dữ liệu nghiệp vụ thực tế | Các tình huống chấm công, ca làm việc, quên bấm và đi trễ |

## Phụ lục A. Bảng tổng hợp rules chính

| Nhóm rule | Nội dung |
| --- | --- |
| Bấm trùng | Gộp mốc trong vòng 5 phút |
| Ca sáng | 07:30 - 11:30, tối đa 4 giờ |
| Ca chiều | 13:00 - 17:00, tối đa 4 giờ |
| Ca tối | 18:00 - 22:00 |
| Ra trưa | 11:00 - 12:10 |
| Vào chiều | 12:00 - 15:00 tùy ngữ cảnh |
| Ra tối | 21:30 - 22:30 |
| Đi trễ | Trong cửa sổ tối đa 120 phút |
| Phạt trễ | Làm tròn theo block 30 phút |
| Ra vào giữa giờ | Từ 15 phút trở lên thì cảnh báo |
| Vùng 17:08 - 17:15 | Gắn cần kiểm tra |
| Vùng 17:33 - 17:40 | Gắn cần kiểm tra |
| Một mốc tối | Gắn cần kiểm tra |
| Dữ liệu mập mờ | Gắn dấu ? |

## Phụ lục B. Bộ case kiểm tra đề xuất

| STT | Case | Kỳ vọng |
| --- | --- | --- |
| 1 | 07:22, 11:31 | 4 giờ sáng |
| 2 | 13:00, 17:01 | 4 giờ chiều |
| 3 | 18:00, 22:00 | 4 giờ tối |
| 4 | 07:22, 11:31, 13:00, 17:01 | 8 giờ |
| 5 | 07:22, 11:31, 13:00, 17:01, 17:30, 17:45, 22:00 | 12.5 giờ |
| 6 | 07:22, 11:31, 13:00, 17:01, 17:33, 17:45, 22:00 | 12.5 giờ và cần kiểm tra |
| 7 | 17:08, 22:00 | Cần kiểm tra |
| 8 | 17:22, 22:00 | Cần xem lại nghiệp vụ vì dễ nhầm bấm sớm ca tối |
| 9 | 22:00 | Không đủ cặp giờ |
| 10 | 07:30, 09:00, 09:30, 11:30 | Cảnh báo ra vào giữa giờ |

## Phụ lục C. Gợi ý danh mục hình ảnh trong báo cáo Word

| Mã hình | Tên hình |
| --- | --- |
| Hình 1.1 | Quy trình chấm công thủ công hiện tại |
| Hình 2.1 | Ví dụ file Excel chấm công đầu vào |
| Hình 3.1 | Use case hệ thống |
| Hình 4.1 | Kiến trúc frontend - backend |
| Hình 4.2 | Luồng xử lý upload file |
| Hình 6.1 | Flowchart rules tính công |
| Hình 6.2 | Timeline vùng 17:00 - 18:00 |
| Hình 9.1 | Giao diện tải file |
| Hình 9.2 | Giao diện kết quả phân tích |
| Hình 9.3 | Panel cần kiểm tra |
| Hình 10.1 | Biểu đồ số lỗi theo loại |
| Hình 10.2 | Biểu đồ ngày công theo tháng |

## Phụ lục D. Gợi ý kết cấu trang khi nộp

Nếu chuyển báo cáo này sang Word, có thể dàn trang theo cấu trúc:

- Trang bìa.
- Lời cảm ơn.
- Nhận xét của giảng viên.
- Mục lục.
- Danh mục hình ảnh.
- Danh mục bảng.
- Nội dung chương 1 đến chương 14.
- Phụ lục.
- Tài liệu tham khảo.

Với font Times New Roman cỡ 13, giãn dòng 1.3 đến 1.5, bản báo cáo này có thể phát triển thành khoảng 45 đến 65 trang tùy số lượng hình ảnh, biểu đồ và ảnh giao diện được chèn thêm.
