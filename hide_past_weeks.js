// ==UserScript==
// @name         HUSC - Ẩn/Hiện lịch các tuần trước + Đếm tuần còn lại
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Tự động ẩn/hiện nút chức năng dựa vào chế độ xem - Hiển thị (x/y tuần)
// @author       Your Name
// @match        https://teacher.husc.edu.vn/Teaching/TimeTable
// @match        https://teacher.husc.edu.vn/Teaching/TimeTable/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    console.log('📅 Script ẩn/hiện lịch tuần trước + đếm tuần khởi động...');

    // === Cấu hình ===
    const STORAGE_KEY = 'HUSC_HIDE_PAST_WEEKS_V10';
    let hidePastWeeks = GM_getValue(STORAGE_KEY, false);

    // === Thêm CSS ===
    GM_addStyle(`
        /* Class ẩn các dòng tuần trước */
        .husc-past-week-row {
            display: none !important;
        }

        /* Badge thông báo số tuần phía sau */
        .week-info-badge {
            display: inline-block;
            background: #17a2b8;
            color: white;
            border-radius: 12px;
            padding: 2px 8px;
            margin-left: 8px;
            font-size: 11px;
            font-weight: bold;
            vertical-align: middle;
            border: 1px solid #117a8b;
        }

        .week-info-badge.finished {
            background: #6c757d;
            border-color: #545b62;
        }

        .btn .glyphicon {
            margin-right: 4px;
        }
    `);

    // === Hàm xác định chế độ xem hiện tại ===
    function getCurrentViewMode() {
        const url = window.location.pathname;
        const currentUrl = window.location.href;

        if (url.includes('/TimeTable/Week') || currentUrl.includes('TimeTable/Week')) {
            return 'week';
        }

        if (url === '/Teaching/TimeTable' || url === '/Teaching/TimeTable/' || url.includes('/TimeTable?')) {
            return 'full';
        }

        return 'unknown';
    }

    // === Hàm kiểm tra nút điều hướng nào đang active ===
    function checkActiveButton() {
        const fullSemesterBtn = document.querySelector('a[href="/Teaching/TimeTable/"]');
        const currentWeekBtn = document.querySelector('a[href="/Teaching/TimeTable/Week"]');

        if (fullSemesterBtn && fullSemesterBtn.classList.contains('disabled')) {
            return 'full';
        }

        if (currentWeekBtn && currentWeekBtn.classList.contains('disabled')) {
            return 'week';
        }

        return getCurrentViewMode();
    }

    // === Hàm phân tích cấu trúc tuần CHÍNH XÁC ===
    function analyzeWeeks() {
        const rows = document.querySelectorAll('table tbody tr');
        const weekRows = [];
        let currentWeekIndex = -1;
        let currentWeekNumber = -1;

        for (let i = 0; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            for (let j = 0; j < cells.length; j++) {
                const cellText = cells[j].textContent.trim();
                if (cellText.match(/Từ ngày \d{2}\/\d{2}\/\d{4} đến ngày \d{2}\/\d{2}\/\d{4}/)) {
                    weekRows.push({
                        rowIndex: i,
                        element: rows[i],
                        text: cellText,
                        colSpan: cells[j].colSpan || 1
                    });
                    break;
                }
            }
        }

        const totalWeeks = weekRows.length;

        for (let i = 0; i < rows.length; i++) {
            if (rows[i].querySelector('.hitec-td-tkbTuanHienTai')) {
                for (let j = weekRows.length - 1; j >= 0; j--) {
                    if (weekRows[j].rowIndex < i) {
                        currentWeekIndex = weekRows[j].rowIndex;
                        currentWeekNumber = j + 1;
                        break;
                    }
                }
                break;
            }
        }

        if (currentWeekNumber === -1) {
            const today = new Date();
            for (let i = 0; i < weekRows.length; i++) {
                const matches = weekRows[i].text.match(/Từ ngày (\d{2})\/(\d{2})\/(\d{4}) đến ngày (\d{2})\/(\d{2})\/(\d{4})/);
                if (matches) {
                    const startDate = new Date(matches[3], matches[2]-1, matches[1]);
                    const endDate = new Date(matches[6], matches[5]-1, matches[4]);

                    if (today >= startDate && today <= endDate) {
                        currentWeekIndex = weekRows[i].rowIndex;
                        currentWeekNumber = i + 1;
                        break;
                    }
                }
            }
        }

        const weeksRemaining = currentWeekNumber === -1 ? 0 : totalWeeks - currentWeekNumber;

        return {
            currentWeekNumber,
            currentWeekIndex,
            totalWeeks,
            weeksRemaining,
            weekRows,
            mode: checkActiveButton()
        };
    }

    // === Hàm ẩn/hiện các tuần trước ===
    function togglePastWeeks(hide) {
        const rows = document.querySelectorAll('table tbody tr');
        const weekInfo = analyzeWeeks();

        if (weekInfo.currentWeekNumber === -1) {
            console.log('⚠️ Không xác định được tuần hiện tại');
            return;
        }

        for (let i = 0; i < weekInfo.currentWeekIndex; i++) {
            const row = rows[i];
            if (hide) {
                row.classList.add('husc-past-week-row');
            } else {
                row.classList.remove('husc-past-week-row');
            }
        }

        updateButtonStyle(hide, weekInfo);

        GM_setValue(STORAGE_KEY, hide);
        hidePastWeeks = hide;
    }

    // === Hàm cập nhật style nút với định dạng (x/y tuần) ===
    function updateButtonStyle(hide, weekInfo) {
        const btn = document.getElementById('toggle-past-weeks-btn');
        if (!btn) return;

        const { weeksRemaining, totalWeeks, currentWeekNumber } = weekInfo;

        // Tạo badge hiển thị (số tuần còn lại / tổng số tuần)
        let badgeHtml;
        if (weeksRemaining > 0) {
            badgeHtml = `<span class="week-info-badge" title="Còn ${weeksRemaining} tuần (tuần ${currentWeekNumber + 1} - ${totalWeeks})">Còn ${weeksRemaining}/${totalWeeks} tuần</span>`;
        } else if (weeksRemaining === 0 && currentWeekNumber > 0) {
            badgeHtml = `<span class="week-info-badge finished" title="Tuần cuối cùng của học kỳ">🏁 ${currentWeekNumber}/${totalWeeks} tuần</span>`;
        } else {
            badgeHtml = `<span class="week-info-badge finished" title="Đã hết học kỳ">✅ 0/${totalWeeks} tuần</span>`;
        }

        // Tooltip chi tiết
        const tooltipText = `Tổng số: ${totalWeeks} tuần | Hiện tại: tuần ${currentWeekNumber} | Còn lại: ${weeksRemaining} tuần`;
        btn.setAttribute('title', tooltipText);

        if (hide) {
            btn.innerHTML = `<span class="glyphicon glyphicon-eye-close"></span> Hiện các tuần trước ${badgeHtml}`;
        } else {
            btn.innerHTML = `<span class="glyphicon glyphicon-eye-open"></span> Ẩn các tuần trước ${badgeHtml}`;
        }
    }

    // === Hàm thêm nút (chỉ khi ở chế độ toàn học kỳ) ===
    function addToggleButton() {
        const mode = checkActiveButton();

        if (mode !== 'full') {
            const existingBtn = document.getElementById('toggle-past-weeks-btn');
            if (existingBtn) {
                existingBtn.remove();
            }
            return;
        }

        if (document.getElementById('toggle-past-weeks-btn')) return;

        const container = findButtonContainer();
        if (!container) {
            console.log('❌ Không tìm thấy container chứa nút');
            return;
        }

        const weekInfo = analyzeWeeks();

        const btn = document.createElement('a');
        btn.id = 'toggle-past-weeks-btn';
        btn.href = 'javascript:void(0);';
        btn.className = 'btn btn-default';
        btn.setAttribute('role', 'button');
        btn.setAttribute('style', 'margin-right: 5px;');

        updateButtonStyle(hidePastWeeks, weekInfo);

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            togglePastWeeks(!hidePastWeeks);
        });

        container.insertBefore(btn, container.firstChild);
    }

    // === Hàm tìm vị trí chèn nút ===
    function findButtonContainer() {
        const navContainer = document.querySelector('.container-fluid.text-right');
        if (navContainer) return navContainer;

        const targetBtn = Array.from(document.querySelectorAll('a')).find(a =>
            a.textContent.includes('Lịch trình giảng dạy toàn học kỳ')
        );

        return targetBtn ? targetBtn.parentNode : null;
    }

    // === Hàm theo dõi thay đổi URL ===
    function observeUrlChanges() {
        let lastUrl = window.location.href;

        setInterval(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                console.log('🔄 Phát hiện thay đổi URL:', currentUrl);
                lastUrl = currentUrl;

                setTimeout(() => {
                    addToggleButton();

                    const mode = checkActiveButton();
                    if (mode === 'week') {
                        const btn = document.getElementById('toggle-past-weeks-btn');
                        if (btn) btn.remove();
                    }
                }, 300);
            }
        }, 500);
    }

    // === Hàm khởi tạo ===
    function init() {
        console.log('🔄 Đang khởi tạo...');

        setTimeout(() => {
            addToggleButton();

            if (hidePastWeeks && checkActiveButton() === 'full') {
                setTimeout(() => {
                    togglePastWeeks(true);
                }, 300);
            }

            observeUrlChanges();
        }, 500);
    }

    // === Theo dõi thay đổi bảng ===
    function observeTable() {
        const targetNode = document.querySelector('table tbody');
        if (!targetNode) return;

        const observer = new MutationObserver(function() {
            setTimeout(() => {
                const mode = checkActiveButton();
                if (mode === 'full') {
                    if (hidePastWeeks) {
                        togglePastWeeks(true);
                    }
                    const btn = document.getElementById('toggle-past-weeks-btn');
                    if (btn) {
                        const weekInfo = analyzeWeeks();
                        updateButtonStyle(hidePastWeeks, weekInfo);
                    }
                }
            }, 200);
        });

        observer.observe(targetNode, { childList: true, subtree: true });
    }

    // Bắt đầu
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            init();
            observeTable();
        });
    } else {
        init();
        observeTable();
    }

})();
