# Báo cáo rules xử lý dữ liệu chấm công

## 1. Mục đích của bộ rules

Bộ rules được xây dựng để hệ thống có thể đọc dữ liệu chấm công từ file Excel, tự động tính giờ công, phát hiện đi trễ, phát hiện quên bấm công và tách ra các trường hợp cần kiểm tra thủ công.

Mục tiêu chính không phải là thay thế hoàn toàn người kiểm tra, mà là tự động hóa các trường hợp rõ ràng và đánh dấu các trường hợp dễ sai để người phụ trách xem lại trước khi xuất kết quả cuối cùng.

## 2. Nguyên nhân hình thành bộ rules

Trước khi có các rules này, dữ liệu chấm công thực tế thường gặp nhiều tình huống không đều:

- Nhân viên bấm công thiếu một lần vào hoặc ra.
- Một ngày có nhiều lần bấm, trong đó có lần bấm sát nhau hoặc bấm trùng.
- Có người làm ca sáng, ca chiều, ca tối, hoặc làm nối từ chiều sang tối.
- Có người bấm ra chiều gần thời điểm bắt đầu ca tối, làm hệ thống khó biết đó là kết thúc ca chiều hay chuẩn bị vào ca tối.
- Có trường hợp chỉ có một lần bấm công nên không đủ cặp giờ để tính.
- Có trường hợp nhân viên ra/vào giữa giờ làm, cần trừ thời gian nghỉ ngoài ca.
- Có trường hợp giờ công lẻ, nếu tính chính xác từng phút thì khó thống nhất với cách chấm công thực tế.

Vì vậy hệ thống cần một bộ quy tắc cố định để xử lý nhất quán, đồng thời vẫn giữ cơ chế "cần kiểm tra" cho các tình huống không chắc chắn.

## 3. Rules về khung giờ làm việc

| Rule | Nội dung | Vì sao chọn rule này | Nguyên nhân trước đó |
| --- | --- | --- | --- |
| Ca sáng | 07:30 đến 11:30, tối đa 4 giờ | Đây là khung giờ làm sáng cố định, dễ quy đổi thành 4 giờ công | Nếu không cố định mốc sáng, các lần bấm trước/sau 07:30 sẽ làm kết quả mỗi ngày không thống nhất |
| Ca chiều | 13:00 đến 17:00, tối đa 4 giờ | Đây là ca làm chính buổi chiều | Dữ liệu có nhiều lần bấm sau 12:00, cần tách rõ giờ ra trưa và giờ vào chiều |
| Ca thêm trước tối | Tính từ 17:00 trong một số trường hợp | Một số nhân viên làm thêm từ sau ca chiều hoặc làm ca tối sớm | Trước đó các mốc 17:00-18:00 dễ bị bỏ qua hoặc bị tính nhầm vào ca chiều/tối |
| Ca tối | 18:00 đến 22:00 | Đây là khung ca tối chính | Nếu chỉ dựa vào lần bấm cuối, hệ thống khó biết nhân viên đang làm ca tối hay chỉ bấm ra muộn |

## 4. Rules về nhận diện giờ vào, giờ ra

| Rule | Nội dung | Vì sao chọn rule này | Nguyên nhân trước đó |
| --- | --- | --- | --- |
| Bấm trùng trong 5 phút | Các lần bấm sát nhau trong vòng 5 phút được xem như một lần bấm | Giảm nhiễu do máy chấm công hoặc người dùng bấm nhiều lần liên tiếp | Nếu giữ toàn bộ lần bấm, hệ thống có thể hiểu nhầm là ra/vào giữa ca |
| Giờ ra trưa | Khoảng 11:00 đến 12:10 được xem là giờ ra ca sáng | Bao phủ cả trường hợp ra đúng 11:30 và ra trễ quanh 12:00 | Trước đó giờ 12:00-12:10 dễ bị hiểu nhầm là giờ vào ca chiều |
| Giờ vào chiều | Khoảng 12:00 đến 15:00 có thể là vào chiều, nhưng nếu đã có giờ vào sáng thì 12:00-12:10 không tính là vào chiều | Tách giờ ra trưa khỏi giờ vào chiều | Dữ liệu thực tế có người bấm ra trưa sau 12:00 |
| Giờ ra tối | Khoảng 21:30 đến 22:30 được xem là dấu hiệu có ca tối | Cho phép nhân viên ra sớm/muộn quanh mốc 22:00 | Nếu bắt đúng 22:00 thì nhiều ca tối hợp lệ sẽ bị bỏ sót |

## 5. Rules tính giờ công

| Rule | Nội dung | Vì sao chọn rule này | Nguyên nhân trước đó |
| --- | --- | --- | --- |
| Làm đủ ca sáng | Nếu có giờ vào sáng và có dữ liệu cho thấy làm qua 11:30 thì tính 4 giờ | Đơn giản hóa ca sáng theo block chuẩn | Nếu tính từng phút tuyệt đối, kết quả dễ lệch nhỏ nhưng không phản ánh cách chấm công thực tế |
| Làm đủ ca chiều | Nếu có giờ vào chiều và làm đến 17:00 thì tính 4 giờ | Ca chiều là block chuẩn 4 giờ | Trước đó các lần bấm sau 17:00 có thể làm ca chiều vượt quá 4 giờ |
| Chiều nối tối | Nếu làm liên tục từ chiều qua tối thì tính 4 giờ chiều cộng phần giờ tối | Phù hợp trường hợp làm nối ca | Nếu không có rule này, phần sau 17:00/18:00 có thể bị bỏ hoặc tính sai |
| Ra chiều rồi vào tối | Nếu có giờ ra chiều và vào lại ca tối, hệ thống tách chiều và tối | Phân biệt làm thêm chiều với ca tối riêng | Trước đó một chuỗi giờ 13:00, 17:20, 17:50, 22:00 rất dễ bị tính thành một ca liền mạch |
| Không đủ cặp giờ | Nếu không đủ dữ liệu vào/ra thì không tự tính công và đưa vào danh sách cần kiểm tra | Tránh tự suy đoán khi thiếu dữ liệu | Trước đó nếu cố tính, kết quả có thể sai lương hoặc sai công |

## 6. Rules làm tròn giờ công

| Rule | Nội dung | Vì sao chọn rule này | Nguyên nhân trước đó |
| --- | --- | --- | --- |
| Làm tròn theo mốc 0, 0.25, 0.5, 0.75, 1 giờ | Phần phút được quy đổi thành phần tư giờ | Phù hợp cách tổng hợp công và tính lương | Tính lẻ từng phút làm bảng công khó đọc và khó đối soát |
| Dư dưới 15 phút | Không cộng thêm | Tránh cộng công cho phần dư quá nhỏ | Trước đó vài phút lẻ có thể làm tổng công tăng không hợp lý |
| Dư 15-24 phút | Cộng 0.25 giờ | Làm tròn theo block 15 phút | Cần một mốc thống nhất thay vì xử lý từng dòng thủ công |
| Dư 25-44 phút | Cộng 0.5 giờ | Gần nửa giờ công | Giúp kết quả ổn định khi bấm lệch vài phút |
| Dư 45-52 phút | Cộng 0.75 giờ | Gần ba phần tư giờ | Tránh nhảy thẳng lên 1 giờ quá sớm |
| Dư từ 53 phút | Làm tròn lên 1 giờ | Gần đủ một giờ | Hạn chế mất công khi nhân viên làm gần đủ giờ |

## 7. Rules đi trễ và trừ công

| Rule | Nội dung | Vì sao chọn rule này | Nguyên nhân trước đó |
| --- | --- | --- | --- |
| Cửa sổ phát hiện trễ | Tối đa 120 phút sau mốc bắt đầu ca | Cho phép nhận diện trường hợp vào trễ nhiều nhưng vẫn còn thuộc ca đó | Nếu cửa sổ quá ngắn, các trường hợp trễ nặng sẽ bị xem như ca khác hoặc không phát hiện |
| Trễ ca sáng | Sau 07:30 và không có lần bấm trước/đúng 07:30 | Mốc vào ca sáng rõ ràng | Trước đó người vào sau 07:30 cần được ghi nhận số phút trễ |
| Trễ ca chiều | Sau 13:00 và không có lần bấm trước/đúng 13:00 | Mốc vào ca chiều rõ ràng | Dữ liệu sau trưa dễ bị lẫn giữa ra trưa và vào chiều |
| Trễ ca tối | Sau 18:00, nếu không có ca chiều | Tách ca tối độc lập khỏi người làm nối ca chiều | Nếu có ca chiều thì không nên tự xem giờ sau 18:00 là đi trễ ca tối |
| Trễ ca thêm 17:00 | Một số ca bắt đầu từ 17:00, nếu vào sau 17:00 thì ghi nhận trễ | Phù hợp trường hợp làm ca thêm hoặc nhiệm vụ ngắn trước ca tối | Trước đó khoảng 17:00-18:00 khó phân loại |
| Trừ phạt theo block 30 phút | Cứ đủ 30 phút trừ 30 phút; phần dư trên 8 phút làm tròn thêm 30 phút | Tạo cách trừ thống nhất, tránh tính quá vụn | Nếu trừ đúng từng phút, kết quả công có nhiều số lẻ và khó kiểm tra |

## 8. Rules quên bấm công

| Rule | Nội dung | Vì sao chọn rule này | Nguyên nhân trước đó |
| --- | --- | --- | --- |
| Chỉ có một lần bấm | Đưa vào cần kiểm tra | Không xác định được đó là giờ vào hay giờ ra | Trước đó hệ thống không đủ dữ liệu để tính công chính xác |
| Có vào sáng và có bấm sau trưa nhưng thiếu giờ ra sáng | Ghi nhận khả năng quên bấm | Cần có cặp vào/ra cho ca sáng | Nếu thiếu giờ ra sáng, tổng công sáng có thể bị tính sai |
| Có ra sáng và ra chiều nhưng không có vào chiều | Ghi nhận khả năng quên bấm | Cần xác định lần vào chiều | Dữ liệu có thể chỉ ghi ra nhưng thiếu vào |
| Có vào chiều nhưng không có giờ ra chiều/tối | Ghi nhận khả năng quên bấm | Không đủ cặp giờ để kết thúc ca | Trước đó sẽ không biết nhân viên làm đến lúc nào |
| Có vào tối nhưng không có giờ ra tối | Ghi nhận khả năng quên bấm | Ca tối cần giờ kết thúc | Nếu tự lấy giờ vào làm giờ ra sẽ sai hoàn toàn |
| Dữ liệu mập mờ | Ghi dấu `?` thay vì tự kết luận | Có những trường hợp không thể xác định chắc bằng rule | Tránh sai kết quả do suy đoán quá mạnh |

## 9. Rules cần kiểm tra thủ công

| Rule | Nội dung | Vì sao chọn rule này | Nguyên nhân trước đó |
| --- | --- | --- | --- |
| Ra/vào giữa giờ công từ 15 phút trở lên | Đánh dấu cần kiểm tra và trừ theo block phạt | Đây có thể là nghỉ riêng trong giờ làm | Trước đó hệ thống chỉ nhìn đầu-cuối nên dễ tính dư công |
| Ra chiều sát ca tối | Các mốc từ khoảng 17:33 đến trước 17:40 hoặc có cặp ra/vào lại gần ca tối được xem là đáng nghi | Khó biết đó là làm thêm chiều, ra về, hay chuẩn bị vào ca tối | Trước đó các ca sát 17:30-18:00 dễ tính sai giữa chiều và tối |
| Giờ vào 17:08-17:15 | Đánh dấu chưa rõ là ca thêm hay bấm sớm ca tối | Khoảng này nằm giữa mốc 17:00 và 18:00, chưa đủ rõ | Nếu tự tính có thể cộng sai phần ca thêm |
| Có bấm sát ca tối nhưng chưa có giờ vào chiều | Đưa vào cần kiểm tra | Thiếu ngữ cảnh để biết nhân viên bắt đầu làm từ lúc nào | Trước đó dễ nhầm là làm chiều hoặc làm tối |
| Ca tối dư phút lẻ lớn | Nếu phần dư sau khi làm tròn ca tối vượt 32 phút thì nhắc kiểm tra | Phần dư lớn có thể là bấm nhầm, ra/vào bất thường hoặc ca phát sinh | Tránh tự cộng thêm công khi dữ liệu tối không rõ |

## 10. Vì sao chọn cách vừa tự động vừa cho kiểm tra thủ công

Hệ thống không cố ép mọi trường hợp thành một kết quả chắc chắn. Các rules rõ ràng được tự động tính để tiết kiệm thời gian. Các trường hợp không chắc chắn được đưa vào danh sách "cần kiểm tra" để người phụ trách quyết định.

Cách này được chọn vì dữ liệu chấm công ảnh hưởng trực tiếp đến công và lương. Nếu hệ thống tự đoán sai, kết quả có thể gây thiệt cho nhân viên hoặc sai chi phí cho công ty. Vì vậy, nguyên tắc xử lý là:

- Trường hợp rõ ràng thì tự động tính.
- Trường hợp thiếu dữ liệu thì báo quên bấm.
- Trường hợp nhiều cách hiểu thì ghi `?` và yêu cầu kiểm tra.
- Trường hợp có thể trừ công thì ghi rõ khoảng thời gian và số phút bị trừ.

## 11. Kết luận

Bộ rules hiện tại được hình thành từ các vấn đề thực tế của dữ liệu chấm công: thiếu lần bấm, bấm trùng, bấm sát ranh ca, ca chiều nối ca tối, ca tối có giờ lẻ và các trường hợp ra/vào giữa giờ. Các rules giúp hệ thống xử lý nhất quán hơn, giảm thao tác thủ công, nhưng vẫn giữ quyền kiểm tra cuối cùng cho các tình huống dễ sai.

Nhờ đó, quy trình chấm công trở nên rõ ràng hơn: hệ thống tính phần chắc chắn, người dùng chỉ cần tập trung vào các dòng bất thường.
