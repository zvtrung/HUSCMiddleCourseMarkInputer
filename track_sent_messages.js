// ==UserScript==
// @name         HUSC - Theo dõi tin nhắn bằng sao
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Đánh dấu tin nhắn cần theo dõi bằng sao, tự động hiển thị số người đọc
// @author       Your Name
// @match        https://teacher.husc.edu.vn/Message/MessageSent
// @match        https://teacher.husc.edu.vn/Message/MessageSent?*
// @match        https://teacher.husc.edu.vn/Message/MessageSent/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_notification
// @connect      teacher.husc.edu.vn
// ==/UserScript==

(function() {
    'use strict';

    console.log('⭐ Script theo dõi tin nhắn bằng sao khởi động...');

    // ==================== CẤU HÌNH ====================
    const STORAGE_KEY = 'HUSC_STARRED_MESSAGES';
    let starredMessages = GM_getValue(STORAGE_KEY, []);
    let readCache = new Map();

    // ==================== CSS ====================
    GM_addStyle(`
        /* Nút sao - gọn nhẹ */
        .star-btn {
            background: transparent;
            border: none;
            font-size: 16px;
            cursor: pointer;
            padding: 0 5px;
            margin: 0 2px;
            transition: all 0.2s;
            vertical-align: middle;
            line-height: 1;
        }
        .star-btn:hover {
            transform: scale(1.2);
        }
        .star-btn.starred {
            color: #f1c40f;  /* Màu vàng sao */
            text-shadow: 0 0 2px #f39c12;
        }
        .star-btn:not(.starred) {
            color: #ccc;
        }
        .star-btn:not(.starred):hover {
            color: #f1c40f;
        }

        /* Badge thống kê - chỉ hiện khi có sao */
        .stats-badge {
            display: inline-block;
            background: #e8f4f8;
            color: #2c3e50;
            border-radius: 12px;
            padding: 2px 8px;
            margin-left: 5px;
            font-size: 11px;
            font-weight: normal;
            border: 1px solid #bdc3c7;
            cursor: pointer;
            transition: all 0.2s;
            vertical-align: middle;
        }
        .stats-badge:hover {
            background: #d5eaf2;
            transform: scale(1.05);
        }
        .stats-badge.loading {
            background: #fff3cd;
            border-color: #ffeeba;
            color: #856404;
            cursor: wait;
        }
        .stats-badge.error {
            background: #f8d7da;
            border-color: #f5c6cb;
            color: #721c24;
        }

        /* Tooltip nhẹ */
        [data-tooltip] {
            position: relative;
            cursor: help;
        }
        [data-tooltip]:hover:after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 150%;
            left: 50%;
            transform: translateX(-50%);
            background: #2c3e50;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            white-space: nowrap;
            z-index: 1000;
            pointer-events: none;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
    `);

    // ==================== LẤY ID TIN NHẮN ====================
    function getMessageId(row) {
        // Từ checkbox
        const checkbox = row.querySelector('input[name="msgID"]');
        if (checkbox?.value) return checkbox.value;

        // Từ link
        const link = row.querySelector('.message-info-title a');
        const match = link?.href?.match(/\/MessageDetail\/(\d+)/);
        return match ? match[1] : null;
    }

    // ==================== QUẢN LÝ SAO ====================
    function isStarred(id) {
        return starredMessages.includes(id);
    }

    function toggleStar(id) {
        const index = starredMessages.indexOf(id);
        if (index === -1) {
            // Thêm sao
            starredMessages.push(id);
            GM_setValue(STORAGE_KEY, starredMessages);
            showNotification('⭐ Đã thêm vào theo dõi', 'success');

            // Khi thêm sao: tự động fetch và hiển thị thống kê
            fetchStatsAndShow(id);
            return true;
        } else {
            // Bỏ sao
            starredMessages.splice(index, 1);
            GM_setValue(STORAGE_KEY, starredMessages);
            showNotification('☆ Đã bỏ theo dõi', 'info');

            // Khi bỏ sao: xóa badge thống kê
            removeStatsFromRow(id);
            return false;
        }
    }

    // ==================== FETCH THỐNG KÊ ====================
    function fetchStatsAndShow(id) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `/Message/Viewed/${id}`,
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (Array.isArray(data)) {
                            const total = data.length;
                            const read = data.filter(item => item.ngayxem && item.ngayxem.trim() !== '').length;
                            const stats = { total, read, unread: total - read };

                            // Lưu cache
                            readCache.set(id, stats);

                            // Cập nhật badge
                            updateStatsBadge(id, stats);
                        }
                    } catch (e) {
                        console.error('Lỗi parse:', e);
                        updateStatsBadge(id, null, true);
                    }
                } else {
                    updateStatsBadge(id, null, true);
                }
            },
            onerror: function() {
                updateStatsBadge(id, null, true);
            }
        });
    }

    // ==================== CẬP NHẬT BADGE ====================
    function updateStatsBadge(id, stats, isError = false) {
        const row = findRowById(id);
        if (!row) return;

        const container = row.querySelector('.message-info-name');
        if (!container) return;

        // Tìm badge cũ
        let badge = container.querySelector('.stats-badge');

        if (!stats && !isError) return;

        if (!badge) {
            // Tạo badge mới
            badge = document.createElement('span');
            badge.className = 'stats-badge loading';
            badge.textContent = '⏳';
            container.appendChild(document.createTextNode(' '));
            container.appendChild(badge);
        }

        if (isError) {
            badge.className = 'stats-badge error';
            badge.textContent = '❌';
            badge.setAttribute('data-tooltip', 'Lỗi tải dữ liệu');
        } else if (stats) {
            badge.className = 'stats-badge';
            badge.textContent = `👁️ ${stats.read}/${stats.total}`;
            badge.setAttribute('data-tooltip', `${stats.read} đã đọc, ${stats.unread} chưa đọc`);

        }
    }

    function removeStatsFromRow(id) {
        const row = findRowById(id);
        if (!row) return;

        const badge = row.querySelector('.stats-badge');
        if (badge) badge.remove();
    }

    function findRowById(id) {
        const rows = document.querySelectorAll('#message_list tr');
        for (const row of rows) {
            if (getMessageId(row) === id) return row;
        }
        return null;
    }

    // ==================== THÊM NÚT VÀO DÒNG ====================
    function processRow(row) {
        const id = getMessageId(row);
        if (!id) return;

        const container = row.querySelector('.message-info-name');
        if (!container) return;

        // Kiểm tra đã có nút sao chưa
        if (container.querySelector('.star-btn')) return;

        // Tạo nút sao
        const starBtn = document.createElement('span');
        starBtn.className = `star-btn ${isStarred(id) ? 'starred' : ''}`;
        starBtn.innerHTML = isStarred(id) ? '★' : '☆';
        starBtn.setAttribute('data-id', id);
        starBtn.setAttribute('data-tooltip', isStarred(id) ? 'Bỏ theo dõi' : 'Theo dõi tin nhắn này');

        starBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();

            const isNowStarred = toggleStar(id);
            this.innerHTML = isNowStarred ? '★' : '☆';
            this.className = `star-btn ${isNowStarred ? 'starred' : ''}`;
            this.setAttribute('data-tooltip', isNowStarred ? 'Bỏ theo dõi' : 'Theo dõi tin nhắn này');
        });

        // Thêm nút sao vào đầu ô
        container.insertBefore(starBtn, container.firstChild);
        container.insertBefore(document.createTextNode(' '), container.firstChild.nextSibling);

        // Nếu đã có sao, tự động fetch và hiển thị thống kê
        if (isStarred(id)) {
            // Kiểm tra cache trước
            if (readCache.has(id)) {
                updateStatsBadge(id, readCache.get(id));
            } else {
                fetchStatsAndShow(id);
            }
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== THÔNG BÁO NHỎ ====================
    function showNotification(msg, type) {
        const noti = document.createElement('div');
        noti.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#2ecc71' : '#3498db'};
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10002;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            animation: fadeInOut 2s ease;
        `;
        noti.textContent = msg;
        document.body.appendChild(noti);
        setTimeout(() => noti.remove(), 2000);
    }

    // ==================== XỬ LÝ DANH SÁCH ====================
    function processAllRows() {
        const list = document.getElementById('message_list');
        if (!list) return;

        const rows = list.querySelectorAll('tr');
        rows.forEach(row => processRow(row));
    }

    // ==================== THEO DÕI THAY ĐỔI ====================
    function observeList() {
        const list = document.getElementById('message_list');
        if (!list) return;

        const observer = new MutationObserver(() => {
            setTimeout(processAllRows, 200);
        });

        observer.observe(list, { childList: true, subtree: true });
    }

    // ==================== KHỞI TẠO ====================
    function init() {
        console.log('🚀 Khởi tạo...');
        setTimeout(processAllRows, 1000);
        observeList();

        // Thêm animation
        GM_addStyle(`
            @keyframes fadeInOut {
                0% { opacity: 0; transform: translateX(100%); }
                10% { opacity: 1; transform: translateX(0); }
                90% { opacity: 1; transform: translateX(0); }
                100% { opacity: 0; transform: translateX(100%); }
            }
        `);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
