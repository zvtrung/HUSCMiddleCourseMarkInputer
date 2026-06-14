// ==UserScript==
// @name         HUSC - Nhập điểm tự động từ Excel
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Nhập điểm tự động từ file Excel
// @author       Your Name
// @match        https://teacher.husc.edu.vn/Teaching/MiddleCourseMarkInput/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 Script HUSC đang khởi động...');

    // ==================== BIẾN TOÀN CỤC ====================
    let isDragging = false;
    let offsetX, offsetY;
    let scoreData = {};
    let workbookData = null;
    let sheetNames = [];
    let currentSheetData = {
        name: '',
        validCount: 0,
        totalRows: 0
    };

    // ==================== KIỂM TRA TRANG WEB ====================
    function checkPageCompatibility() {
        const table = document.querySelector('table');
        if (!table) {
            console.warn('⚠ Không tìm thấy bảng điểm trên trang này');
            return false;
        }

        const rows = document.querySelectorAll('table tbody tr');
        if (rows.length === 0) {
            console.warn('⚠ Không tìm thấy dòng dữ liệu trong bảng');
            return false;
        }

        console.log(`✅ Tìm thấy bảng điểm với ${rows.length} dòng`);
        return true;
    }

    // ==================== TẠO GIAO DIỆN ====================
    function createUI() {
        console.log('🖼️ Đang tạo giao diện...');

        if (document.getElementById('auto-input-container')) {
            return document.getElementById('auto-input-container');
        }

        const container = document.createElement('div');
        container.id = 'auto-input-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            border: 2px solid #007bff;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            width: 400px;
            cursor: default;
            user-select: none;
            font-family: Arial, sans-serif;
        `;

        // Thanh tiêu đề (có thể kéo)
        const header = document.createElement('div');
        header.id = 'husc-drag-handle';
        header.style.cssText = `
            background: #007bff;
            color: white;
            padding: 12px 15px;
            border-radius: 6px 6px 0 0;
            cursor: move;
            font-weight: bold;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <span>📥 Nhập điểm tự động</span>
            <span id="toggle-btn" style="cursor: pointer; font-size: 16px;">🔽</span>
        `;

        // Nội dung chính
        const content = document.createElement('div');
        content.id = 'tool-content';
        content.style.cssText = `padding: 15px;`;

        content.innerHTML = `
            <!-- Bước 1: Chọn file -->
            <div style="margin-bottom: 15px; background: #f0f7ff; padding: 10px; border-radius: 5px;">
                <div style="font-weight: bold; color: #007bff; margin-bottom: 8px;">1️⃣ Chọn file Excel</div>
                <input type="file" id="excel-file" accept=".xlsx,.xls" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            </div>

            <!-- Bước 2: Chọn sheet -->
            <div id="sheet-section" style="margin-bottom: 15px; background: #f0f7ff; padding: 10px; border-radius: 5px; display: none;">
                <div style="font-weight: bold; color: #007bff; margin-bottom: 8px;">2️⃣ Chọn sheet dữ liệu</div>
                <select id="sheet-select" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: white;" disabled>
                    <option value="">-- Đang chờ file --</option>
                </select>
                <div id="sheet-status" style="margin-top: 5px; font-size: 11px; color: #666;"></div>
            </div>

            <!-- Bước 3: Chọn cột dữ liệu -->
            <div style="margin-bottom: 15px; background: #f0f7ff; padding: 10px; border-radius: 5px;">
                <div style="font-weight: bold; color: #007bff; margin-bottom: 8px;">3️⃣ Chỉ định cột dữ liệu</div>
                <div style="display: flex; gap: 10px;">
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 3px; font-size: 12px;">Mã SV (cột)</label>
                        <input type="text" id="student-id-col" value="A" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; text-align: center;">
                    </div>
                    <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 3px; font-size: 12px;">Điểm (cột)</label>
                        <input type="text" id="score-col" value="B" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; text-align: center;">
                    </div>
                </div>
            </div>

            <!-- Khu vực nút điều khiển -->
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button id="load-data-btn" style="
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 10px;
                    border-radius: 5px;
                    cursor: not-allowed;
                    flex: 1;
                    font-weight: bold;
                    opacity: 0.5;
                    transition: all 0.2s;
                " disabled>📊 Nạp điểm</button>

                <button id="fill-btn" style="
                    background: #28a745;
                    color: white;
                    border: none;
                    padding: 10px;
                    border-radius: 5px;
                    cursor: not-allowed;
                    flex: 1;
                    font-weight: bold;
                    opacity: 0.5;
                    transition: all 0.2s;
                " disabled>✍️ Điền điểm</button>

                <button id="clear-highlight-btn" style="
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px;
                    border-radius: 5px;
                    cursor: pointer;
                    flex: 0.5;
                    font-weight: bold;
                    transition: all 0.2s;
                " title="Xóa highlight màu">🧹</button>
            </div>

            <!-- Khu vực thống kê và kết quả - DẠNG CUỘN -->
            <div style="margin-bottom: 15px; border: 1px solid #dee2e6; border-radius: 5px; overflow: hidden;">
                <!-- Tab điều hướng -->
                <div style="display: flex; background: #e9ecef; border-bottom: 1px solid #dee2e6;">
                    <div id="tab-stats" style="flex: 1; padding: 8px; text-align: center; cursor: pointer; font-weight: bold; background: #fff; border-bottom: 2px solid #007bff;">📊 Thống kê</div>
                    <div id="tab-result" style="flex: 1; padding: 8px; text-align: center; cursor: pointer; font-weight: bold; background: #e9ecef;">📋 Kết quả</div>
                </div>

                <!-- Nội dung thống kê (dạng cuộn) -->
                <div id="stats-section" style="padding: 10px; max-height: 120px; overflow-y: auto; background: #f8f9fa; display: block;">
                    <div id="stats-content" style="font-size: 12px; line-height: 1.6;">
                        ⏳ Chưa có dữ liệu
                    </div>
                </div>

                <!-- Nội dung kết quả (dạng cuộn) -->
                <div id="result-section" style="padding: 10px; max-height: 120px; overflow-y: auto; background: #f8f9fa; display: none;">
                    <div id="result-content" style="font-size: 12px; line-height: 1.6;">
                        ⏳ Chưa điền điểm
                    </div>
                </div>
            </div>

            <!-- Khu vực trạng thái chính -->
            <div id="status" style="
                font-size: 12px;
                padding: 8px;
                background: #f8f9fa;
                border-radius: 4px;
                border-left: 3px solid #007bff;
                min-height: 36px;
                max-height: 60px;
                overflow-y: auto;
            ">
                ⏳ Chọn file Excel để bắt đầu
            </div>

            <div style="margin-top: 8px; font-size: 11px; color: #666; text-align: center;">
                🖱️ Kéo thanh tiêu đề | 📑 Chuyển tab để xem chi tiết | 🧹 Xóa highlight
            </div>
        `;

        container.appendChild(header);
        container.appendChild(content);
        document.body.appendChild(container);

        console.log('✅ Đã tạo giao diện thành công');

        // Gán sự kiện thu gọn
        document.getElementById('toggle-btn').onclick = function(e) {
            e.stopPropagation();
            const content = document.getElementById('tool-content');
            const btn = document.getElementById('toggle-btn');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                btn.textContent = '🔽';
            } else {
                content.style.display = 'none';
                btn.textContent = '🔼';
            }
        };

        return container;
    }

    // ==================== KÉO THẢ ====================
    function setupDraggable(container) {
        const handle = document.getElementById('husc-drag-handle');
        if (!handle) return;

        handle.onmousedown = function(e) {
            if (e.button !== 0) return;
            e.preventDefault();

            const rect = container.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            isDragging = true;
            handle.style.cursor = 'grabbing';
        };

        document.onmousemove = function(e) {
            if (!isDragging) return;
            e.preventDefault();

            let newX = e.clientX - offsetX;
            let newY = e.clientY - offsetY;

            const rect = container.getBoundingClientRect();
            newX = Math.max(0, Math.min(newX, window.innerWidth - rect.width));
            newY = Math.max(0, Math.min(newY, window.innerHeight - rect.height));

            container.style.left = newX + 'px';
            container.style.top = newY + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        };

        document.onmouseup = function() {
            if (isDragging) {
                isDragging = false;
                handle.style.cursor = 'move';
            }
        };
    }

    // ==================== XỬ LÝ TAB ====================
    function setupTabs() {
        const tabStats = document.getElementById('tab-stats');
        const tabResult = document.getElementById('tab-result');
        const statsSection = document.getElementById('stats-section');
        const resultSection = document.getElementById('result-section');

        tabStats.addEventListener('click', function() {
            // Active tab stats
            tabStats.style.background = '#fff';
            tabStats.style.borderBottom = '2px solid #007bff';
            tabResult.style.background = '#e9ecef';
            tabResult.style.borderBottom = 'none';

            // Show stats, hide result
            statsSection.style.display = 'block';
            resultSection.style.display = 'none';
        });

        tabResult.addEventListener('click', function() {
            // Active tab result
            tabResult.style.background = '#fff';
            tabResult.style.borderBottom = '2px solid #28a745';
            tabStats.style.background = '#e9ecef';
            tabStats.style.borderBottom = 'none';

            // Show result, hide stats
            resultSection.style.display = 'block';
            statsSection.style.display = 'none';
        });
    }

    // ==================== XỬ LÝ KHI CHỌN FILE ====================
    function handleFileSelect(file) {
        if (!file) {
            updateStatus('⚠ Vui lòng chọn file Excel', 'orange');
            return;
        }

        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            updateStatus('⚠ Chỉ hỗ trợ file .xlsx hoặc .xls', 'red');
            return;
        }

        updateStatus('⏳ Đang đọc file...', 'blue');

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                workbookData = XLSX.read(data, {type: 'array'});
                sheetNames = workbookData.SheetNames;

                const sheetSection = document.getElementById('sheet-section');
                const sheetSelect = document.getElementById('sheet-select');
                const sheetStatus = document.getElementById('sheet-status');

                sheetSection.style.display = 'block';

                if (sheetNames.length === 0) {
                    sheetSelect.innerHTML = '<option value="">-- Không tìm thấy sheet --</option>';
                    sheetSelect.disabled = true;
                    sheetStatus.innerHTML = '❌ File không chứa sheet nào';
                    sheetStatus.style.color = 'red';
                    disableButtons(true, true);
                } else {
                    sheetSelect.innerHTML = '';
                    sheetNames.forEach((name, index) => {
                        const option = document.createElement('option');
                        option.value = index;
                        option.textContent = `${index + 1}. ${name}`;
                        sheetSelect.appendChild(option);
                    });

                    sheetSelect.disabled = false;
                    sheetStatus.innerHTML = `✅ Tìm thấy ${sheetNames.length} sheets`;
                    sheetStatus.style.color = 'green';
                    disableButtons(false, true);
                }

                updateStatus(`✅ Đã đọc file: ${file.name}`, 'green');

            } catch (error) {
                updateStatus(`❌ Lỗi đọc file: ${error.message}`, 'red');
                console.error('Lỗi:', error);
            }
        };

        reader.readAsArrayBuffer(file);
    }

    // ==================== VÔ HIỆU/KÍCH HOẠT NÚT ====================
    function disableButtons(disableLoad, disableFill) {
        const loadBtn = document.getElementById('load-data-btn');
        const fillBtn = document.getElementById('fill-btn');

        if (disableLoad) {
            loadBtn.disabled = true;
            loadBtn.style.opacity = '0.5';
            loadBtn.style.cursor = 'not-allowed';
        } else {
            loadBtn.disabled = false;
            loadBtn.style.opacity = '1';
            loadBtn.style.cursor = 'pointer';
        }

        if (disableFill) {
            fillBtn.disabled = true;
            fillBtn.style.opacity = '0.5';
            fillBtn.style.cursor = 'not-allowed';
        } else {
            fillBtn.disabled = false;
            fillBtn.style.opacity = '1';
            fillBtn.style.cursor = 'pointer';
        }
    }

    // ==================== NẠP ĐIỂM TỪ SHEET ====================
    function loadDataFromSheet() {
        try {
            if (!workbookData) {
                updateStatus('⚠ Vui lòng chọn file Excel trước!', 'orange');
                return;
            }

            const sheetSelect = document.getElementById('sheet-select');
            if (sheetSelect.disabled || sheetSelect.value === '') {
                updateStatus('⚠ Vui lòng chọn sheet dữ liệu!', 'orange');
                return;
            }

            const studentIdCol = document.getElementById('student-id-col').value.trim().toUpperCase();
            const scoreCol = document.getElementById('score-col').value.trim().toUpperCase();

            if (!studentIdCol || !scoreCol) {
                updateStatus('⚠ Vui lòng nhập cột dữ liệu!', 'orange');
                return;
            }

            const studentIdColIndex = getColumnIndex(studentIdCol);
            const scoreColIndex = getColumnIndex(scoreCol);

            if (studentIdColIndex === -1 || scoreColIndex === -1) {
                updateStatus('⚠ Cột không hợp lệ! Nhập A-Z hoặc 0-9', 'orange');
                return;
            }

            updateStatus('⏳ Đang nạp dữ liệu từ sheet...', 'blue');

            const sheetIndex = parseInt(sheetSelect.value);
            const sheetName = sheetNames[sheetIndex];
            const sheet = workbookData.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, {header: 1});

            scoreData = {};
            let validCount = 0;
            let totalRows = 0;
            let invalidRows = [];
            let sampleData = [];

            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0) continue;

                totalRows++;

                const studentId = row[studentIdColIndex];
                const score = row[scoreColIndex];

                if (studentId && score !== null && score !== undefined && score !== '') {
                    const cleanStudentId = studentId.toString().trim();
                    const cleanScore = score.toString().trim();

                    if (!isNaN(parseFloat(cleanScore))) {
                        scoreData[cleanStudentId] = cleanScore;
                        validCount++;

                        if (validCount <= 3) {
                            sampleData.push(`${cleanStudentId}: ${cleanScore}`);
                        }
                    } else {
                        invalidRows.push(`Dòng ${i+1}: ${cleanScore}`);
                    }
                }
            }

            currentSheetData = {
                name: sheetName,
                validCount: validCount,
                totalRows: totalRows
            };

            // Cập nhật tab thống kê
            const statsContent = document.getElementById('stats-content');
            let statsHtml = `
                <div>📑 Sheet: <strong>${sheetName}</strong></div>
                <div>✅ Hợp lệ: <strong style="color: #28a745;">${validCount}</strong> / ${totalRows}</div>
            `;

            if (invalidRows.length > 0) {
                statsHtml += `<div>⚠ Không hợp lệ: <strong style="color: #dc3545;">${invalidRows.length}</strong>`;
                if (invalidRows.length <= 3) {
                    statsHtml += `<br><span style="font-size: 11px;">${invalidRows.join('; ')}</span>`;
                }
                statsHtml += `</div>`;
            }

            if (sampleData.length > 0) {
                statsHtml += `<div style="margin-top: 5px;">📝 Mẫu: ${sampleData.join(' | ')}</div>`;
            }

            statsContent.innerHTML = statsHtml;

            // Reset tab result
            document.getElementById('result-content').innerHTML = '⏳ Chưa điền điểm';

            // Chuyển về tab thống kê
            document.getElementById('tab-stats').click();

            if (validCount === 0) {
                updateStatus('❌ Không tìm thấy điểm hợp lệ nào!', 'red');
                disableButtons(false, true);
            } else {
                updateStatus(`✅ Đã nạp ${validCount} điểm từ sheet "${sheetName}"`, 'green');
                disableButtons(false, false);
            }

        } catch (error) {
            updateStatus(`❌ Lỗi: ${error.message}`, 'red');
            console.error('Lỗi nạp dữ liệu:', error);
        }
    }

    // ==================== ĐIỀN ĐIỂM VÀO FORM ====================
    function fillScores() {
        if (Object.keys(scoreData).length === 0) {
            updateStatus('⚠ Không có dữ liệu điểm! Hãy nạp dữ liệu trước.', 'orange');
            return;
        }

        updateStatus('⏳ Đang điền điểm...', 'blue');

        let filled = 0;
        let notFound = 0;
        const notFoundList = [];
        const filledList = [];

        const rows = document.querySelectorAll('table tbody tr');

        if (rows.length === 0) {
            updateStatus('⚠ Không tìm thấy bảng điểm trên trang!', 'red');
            return;
        }

        clearHighlights();

        rows.forEach(row => {
            try {
                const cells = row.querySelectorAll('td');
                if (cells.length < 3) return;

                const studentIdCell = cells[1];
                const studentId = studentIdCell.textContent.trim().split('\n')[0].trim();

                const scoreInput = row.querySelector('input[name="diem[]"]');

                if (studentId && scoreInput) {
                    if (scoreData[studentId]) {
                        scoreInput.value = scoreData[studentId];

                        scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
                        scoreInput.dispatchEvent(new Event('change', { bubbles: true }));

                        scoreInput.style.backgroundColor = '#e8f5e8';
                        scoreInput.style.transition = 'background-color 0.3s';

                        filled++;
                        if (filledList.length < 5) {
                            filledList.push(studentId);
                        }
                    } else {
                        notFound++;
                        if (notFoundList.length < 5) {
                            notFoundList.push(studentId);
                        }

                        scoreInput.style.backgroundColor = '#fff3cd';
                    }
                }
            } catch (e) {
                console.log('Lỗi xử lý dòng:', e);
            }
        });

        // Cập nhật tab kết quả
        const resultContent = document.getElementById('result-content');

        let resultHtml = `
            <div>✅ Đã điền: <strong style="color: #28a745;">${filled}</strong></div>
            <div>⚠ Không có: <strong style="color: #fd7e14;">${notFound}</strong></div>
        `;

        if (filledList.length > 0) {
            resultHtml += `<div style="margin-top: 5px;"><strong>📝 Đã điền:</strong> ${filledList.join(', ')}</div>`;
        }

        if (notFoundList.length > 0) {
            resultHtml += `<div style="color: #fd7e14;"><strong>🔍 Thiếu:</strong> ${notFoundList.join(', ')}</div>`;
        }

        resultContent.innerHTML = resultHtml;

        // Chuyển sang tab kết quả
        document.getElementById('tab-result').click();

        if (filled > 0) {
            updateStatus(`✅ Đã điền xong ${filled} điểm!`, 'green');
        } else {
            updateStatus('❌ Không điền được điểm nào!', 'red');
        }
    }

    // ==================== XÓA HIGHLIGHT ====================
    function clearHighlights() {
        const inputs = document.querySelectorAll('input[name="diem[]"]');
        inputs.forEach(input => {
            input.style.backgroundColor = '';
        });
        updateStatus('🧹 Đã xóa highlight', 'blue');
    }

    // ==================== CHUYỂN ĐỔI TÊN CỘT ====================
    function getColumnIndex(col) {
        if (!col) return -1;

        if (!isNaN(col)) {
            return parseInt(col);
        }

        if (col.length === 1 && col.match(/[A-Z]/i)) {
            return col.toUpperCase().charCodeAt(0) - 65;
        }

        return -1;
    }

    // ==================== CẬP NHẬT TRẠNG THÁI ====================
    function updateStatus(message, color = 'black') {
        const statusDiv = document.getElementById('status');
        if (statusDiv) {
            statusDiv.innerHTML = message;
            const colorMap = {
                'green': '#28a745',
                'red': '#dc3545',
                'orange': '#fd7e14',
                'blue': '#007bff'
            };
            statusDiv.style.borderLeftColor = colorMap[color] || '#007bff';
        }
    }

    // ==================== KHỞI TẠO ====================
    function init() {
        console.log('🎯 Bắt đầu khởi tạo script...');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(run, 500);
            });
        } else {
            setTimeout(run, 500);
        }
    }

    function run() {
        console.log('🏃 Đang chạy script...');

        if (!checkPageCompatibility()) {
            console.log('ℹ️ Trang hiện tại không phải trang nhập điểm');
            return;
        }

        const container = createUI();
        if (!container) return;

        setupDraggable(container);
        setupTabs();

        // Sự kiện chọn file
        document.getElementById('excel-file').addEventListener('change', function(e) {
            handleFileSelect(e.target.files[0]);
            // Reset tabs
            document.getElementById('stats-content').innerHTML = '⏳ Chưa có dữ liệu';
            document.getElementById('result-content').innerHTML = '⏳ Chưa điền điểm';
            document.getElementById('tab-stats').click();
        });

        // Sự kiện nút nạp điểm
        document.getElementById('load-data-btn').addEventListener('click', loadDataFromSheet);

        // Sự kiện nút điền điểm
        document.getElementById('fill-btn').addEventListener('click', fillScores);

        // Sự kiện nút xóa highlight
        document.getElementById('clear-highlight-btn').addEventListener('click', clearHighlights);

        // Thêm CSS
        const style = document.createElement('style');
        style.textContent = `
            #auto-input-container {
                transition: box-shadow 0.2s;
                animation: slideIn 0.3s ease-out;
            }
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            #auto-input-container:hover {
                box-shadow: 0 8px 16px rgba(0,0,0,0.2);
            }
            #stats-section::-webkit-scrollbar, #result-section::-webkit-scrollbar, #status::-webkit-scrollbar {
                width: 6px;
            }
            #stats-section::-webkit-scrollbar-thumb, #result-section::-webkit-scrollbar-thumb, #status::-webkit-scrollbar-thumb {
                background: #ccc;
                border-radius: 3px;
            }
            #stats-section::-webkit-scrollbar-thumb:hover, #result-section::-webkit-scrollbar-thumb:hover, #status::-webkit-scrollbar-thumb:hover {
                background: #999;
            }
        `;
        document.head.appendChild(style);

        console.log('🎉 Script đã sẵn sàng!');
    }

    // Bắt đầu
    init();

})();
