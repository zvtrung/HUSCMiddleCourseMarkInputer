// ==UserScript==
// @name         HUSC - Hiển thị số người đã đọc trên danh sách tin nhắn gửi
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Hiển thị số lượng người đã đọc cho mỗi tin nhắn trong danh sách tin nhắn gửi
// @author       Your Name
// @match        https://teacher.husc.edu.vn/Message/MessageSent
// @match        https://teacher.husc.edu.vn/Message/MessageSent?*
// @match        https://teacher.husc.edu.vn/Message/MessageSent/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      teacher.husc.edu.vn
// ==/UserScript==

(function() {
    'use strict';

    console.log('📨 Script hiển thị số người đọc trên danh sách tin nhắn khởi động...');

    // Cache để lưu kết quả đã fetch, tránh gọi lại nhiều lần
    const readCountCache = new Map();

    // Thêm CSS cho badge - Đã đổi màu nền thành #365f91
    GM_addStyle(`
        .message-read-badge {
            display: inline-block;
            background: #f5f5f5; /*#365f91;*/  /* Màu xanh dương đậm theo yêu cầu */
            color: #365f91; /*white;*/
            border-radius: 12px;
            padding: 2px 8px;
            margin-left: 8px;
            font-size: 11px;
            /*font-weight: bold;*/
            cursor: pointer;
            transition: all 0.2s;
            border: 1px solid #aaaaaa; /*#1e4b7a;*/  /* Màu viền đậm hơn một chút */
            white-space: nowrap;
        }
        .message-read-badge:hover {
            background: #f4f4f4; /*#2c4e7a;*/  /* Màu đậm hơn khi hover */
            transform: scale(1.05);
        }
        .message-read-badge.loading {
            background: #ffc107;
            border-color: #e0a800;
            cursor: wait;
            color: #333;
        }
        .message-read-badge.error {
            background: #dc3545;
            border-color: #bd2130;
        }
        /* Tooltip nhỏ khi hover */
        .message-read-badge[data-tooltip] {
            position: relative;
        }
        .message-read-badge[data-tooltip]:hover:after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 120%;
            left: 50%;
            transform: translateX(-50%);
            background: #f5f5f5; /*#333;*/
            color: #365f91; /*white;*/
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            white-space: nowrap;
            z-index: 1000;
            pointer-events: none;
            border: 1px solid #aaaaaa; /*#1e4b7a;*/  /* Màu viền đậm hơn một chút */
        }
    `);

    // Hàm lấy số người đọc cho một tin nhắn
    function fetchReadCount(messageId, callback) {
        // Kiểm tra cache trước
        if (readCountCache.has(messageId)) {
            callback(readCountCache.get(messageId));
            return;
        }

        const detailsUrl = `/Message/Viewed/${messageId}`;

        GM_xmlhttpRequest({
            method: 'GET',
            url: detailsUrl,
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (Array.isArray(data)) {
                            const total = data.length;
                            const read = data.filter(item => item.ngayxem && item.ngayxem.trim() !== '').length;
                            const result = { total, read, unread: total - read };
                            // Lưu vào cache
                            readCountCache.set(messageId, result);
                            callback(result);
                        } else {
                            callback(null);
                        }
                    } catch (e) {
                        console.error(`❌ Lỗi parse JSON cho tin nhắn ${messageId}:`, e);
                        callback(null);
                    }
                } else {
                    callback(null);
                }
            },
            onerror: function() {
                callback(null);
            }
        });
    }

    // Hàm thêm badge vào một dòng tin nhắn
    function addBadgeToMessageRow(row, messageId) {
        // Tìm ô chứa tên người nhận (nơi chúng ta sẽ thêm badge)
        const recipientCell = row.querySelector('.message-info-name');
        if (!recipientCell) return;

        // Tạo badge
        const badge = document.createElement('span');
        badge.className = 'message-read-badge loading';
        badge.textContent = '⏳';
        badge.setAttribute('data-message-id', messageId);

        // Thêm badge vào cuối ô
        recipientCell.appendChild(document.createTextNode(' ')); // Thêm khoảng trắng
        recipientCell.appendChild(badge);

        // Fetch dữ liệu
        fetchReadCount(messageId, function(result) {
            if (!result) {
                badge.className = 'message-read-badge error';
                badge.textContent = '❌';
                badge.setAttribute('data-tooltip', 'Không thể tải');
                return;
            }

            // Cập nhật badge với màu #365f91 (đã được định nghĩa trong CSS)
            badge.className = 'message-read-badge';
            badge.textContent = `👁️ ${result.read}/${result.total}`;
            badge.setAttribute('data-tooltip', `${result.read} đã đọc, ${result.unread} chưa đọc`);

            // Thêm sự kiện click để xem chi tiết
            badge.addEventListener('click', function(e) {
                e.stopPropagation();
                e.preventDefault();
                showReadDetails(messageId, result);
            });
        });
    }

    // Hàm hiển thị popup chi tiết
    function showReadDetails(messageId, summary) {
        // Kiểm tra popup đã tồn tại chưa
        let popup = document.getElementById('read-details-popup');
        if (!popup) {
            popup = createDetailsPopup();
        }

        // Fetch chi tiết đầy đủ
        GM_xmlhttpRequest({
            method: 'GET',
            url: `/Message/Viewed/${messageId}`,
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        updatePopupContent(data, summary);
                        popup.classList.add('show');
                    } catch (e) {
                        alert('Không thể tải chi tiết người đọc');
                    }
                }
            }
        });
    }

    // Hàm tạo popup chi tiết
    function createDetailsPopup() {
        const popup = document.createElement('div');
        popup.id = 'read-details-popup';
        popup.className = 'read-details-popup';
        popup.innerHTML = `
            <div class="popup-header">
                <span>📋 Chi tiết người đã xem tin nhắn</span>
                <span class="popup-close" id="close-popup-btn">&times;</span>
            </div>
            <div class="popup-content" id="popup-content">
                <div style="text-align: center; padding: 30px;">⏳ Đang tải...</div>
            </div>
            <div class="popup-footer" id="popup-footer"></div>
        `;
        document.body.appendChild(popup);

        document.getElementById('close-popup-btn').addEventListener('click', () => {
            popup.classList.remove('show');
        });

        popup.addEventListener('click', (e) => {
            if (e.target === popup) popup.classList.remove('show');
        });

        return popup;
    }

    // Hàm cập nhật nội dung popup
    function updatePopupContent(data, summary) {
        const popupContent = document.getElementById('popup-content');
        const popupFooter = document.getElementById('popup-footer');

        if (!popupContent || !popupFooter) return;

        // Sắp xếp: đã xem lên trước
        const readers = data.map(item => ({
            name: item.nguoinhan,
            time: item.ngayxem || '',
            hasRead: !!(item.ngayxem && item.ngayxem.trim() !== '')
        })).sort((a, b) => {
            if (a.hasRead && !b.hasRead) return -1;
            if (!a.hasRead && b.hasRead) return 1;
            return 0;
        });

        let html = `
            <div class="summary-stats">
                <strong>Tổng số:</strong> ${summary.total} người nhận |
                <strong style="color: #28a745;">✅ Đã xem:</strong> ${summary.read} |
                <strong style="color: #dc3545;">⏳ Chưa xem:</strong> ${summary.unread}
            </div>
            <table class="reader-table">
                <tr><th>Họ tên</th><th>Thời điểm xem</th></tr>
        `;

        readers.forEach(r => {
            html += `<tr>
                <td>${escapeHtml(r.name)}</td>
                <td class="${r.hasRead ? 'read-time' : 'unread'}">${r.hasRead ? r.time : '⏳ Chưa xem'}</td>
            </tr>`;
        });
        html += '</table>';

        popupContent.innerHTML = html;
        popupFooter.textContent = `Tổng số: ${summary.total} người nhận (${summary.read} đã xem, ${summary.unread} chưa xem)`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Hàm xử lý khi danh sách tin nhắn được render
    function processMessageList() {
        const rows = document.querySelectorAll('#message_list tr');
        console.log(`🔍 Tìm thấy ${rows.length} dòng tin nhắn`);

        rows.forEach(row => {
            // Tìm checkbox để lấy ID tin nhắn
            const checkbox = row.querySelector('input[type="checkbox"][name="msgID"]');
            if (!checkbox) return;

            const messageId = checkbox.value;
            if (!messageId) return;

            // Kiểm tra xem đã có badge chưa (tránh thêm lại)
            if (row.querySelector('.message-read-badge')) return;

            addBadgeToMessageRow(row, messageId);
        });
    }

    // Hàm theo dõi sự thay đổi của bảng tin nhắn (vì trang load bằng AJAX)
    function observeMessageList() {
        const targetNode = document.getElementById('message_list');
        if (!targetNode) {
            console.log('❌ Không tìm thấy #message_list');
            return;
        }

        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    console.log('🔄 Phát hiện thay đổi trong danh sách tin nhắn');
                    setTimeout(processMessageList, 300); // Đợi DOM ổn định
                }
            });
        });

        observer.observe(targetNode, { childList: true, subtree: true });
        console.log('👀 Đã bắt đầu theo dõi thay đổi của danh sách tin nhắn');
    }

    // Hàm khởi tạo
    function init() {
        console.log('🔄 Đang khởi tạo...');

        // Thêm CSS cho popup
        GM_addStyle(`
            .read-details-popup {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border: 2px solid #007bff;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                z-index: 10000;
                width: 600px;
                max-width: 90%;
                max-height: 80vh;
                overflow: hidden;
                display: none;
                font-family: Arial, sans-serif;
            }
            .read-details-popup.show {
                display: block;
                animation: fadeIn 0.2s ease-out;
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translate(-50%, -48%); }
                to { opacity: 1; transform: translate(-50%, -50%); }
            }
            .popup-header {
                background: #007bff;
                color: white;
                padding: 12px 15px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .popup-close {
                cursor: pointer;
                font-size: 20px;
                line-height: 1;
                padding: 0 5px;
            }
            .popup-close:hover { opacity: 0.8; }
            .popup-content {
                padding: 15px;
                max-height: calc(80vh - 110px);
                overflow-y: auto;
            }
            .reader-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }
            .reader-table th {
                background: #f8f9fa;
                padding: 10px;
                text-align: left;
                border-bottom: 2px solid #dee2e6;
            }
            .reader-table td {
                padding: 8px 10px;
                border-bottom: 1px solid #e9ecef;
            }
            .reader-table .read-time { color: #28a745; font-weight: 500; }
            .reader-table .unread { color: #dc3545; font-style: italic; }
            .popup-footer {
                padding: 10px 15px;
                background: #f8f9fa;
                border-top: 1px solid #dee2e6;
                text-align: right;
                font-size: 12px;
            }
            .summary-stats {
                background: #e8f5e8;
                padding: 10px 15px;
                border-radius: 4px;
                margin-bottom: 15px;
                font-size: 13px;
                border-left: 3px solid #28a745;
            }
        `);

        // Xử lý lần đầu
        setTimeout(processMessageList, 500);

        // Theo dõi các lần sau
        observeMessageList();
    }

    // Bắt đầu
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
