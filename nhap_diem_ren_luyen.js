// ==UserScript==
// @name         HUSC - Nhập điểm rèn luyện từ Excel
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Nhập điểm rèn luyện tự động - Chỉ hiển thị panel khi cần
// @author       Your Name
// @match        https://teacher.husc.edu.vn/Consultant
// @match        https://teacher.husc.edu.vn/Consultant/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 Script nhập điểm rèn luyện khởi động...');

    // ==================== BIẾN TOÀN CỤC ====================
    let isDragging = false;
    let offsetX, offsetY;
    let scoreData = {};
    let workbookData = null;
    let sheetNames = [];
    let isFormReady = false;
    let panelCreated = false;
    let panelContainer = null;

    // ==================== LẤY DANH SÁCH SINH VIÊN ====================
    function getStudentData() {
        const conductForm = document.getElementById('formConductMarksInput');
        if (!conductForm) return [];

        const students = [];
        const rows = conductForm.querySelectorAll('table tbody tr');

        rows.forEach((row, idx) => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 3) return;

            const studentIdCell = cells[1];
            let studentId = '';
            const link = studentIdCell.querySelector('a');
            if (link) {
                studentId = link.textContent.trim();
            } else {
                studentId = studentIdCell.textContent.trim();
            }

            const scoreInput = row.querySelector('input[type="text"], input[type="number"]');

            if (studentId && scoreInput) {
                students.push({ id: studentId, input: scoreInput, row: row });
            }
        });

        return students;
    }

    // ==================== KIỂM TRA FORM ====================
    function checkFormReady() {
        const conductForm = document.getElementById('formConductMarksInput');
        if (conductForm && conductForm.querySelector('table tbody tr')) {
            const students = getStudentData();
            if (students.length > 0) {
                isFormReady = true;
                updatePanelStatus(`✅ Sẵn sàng (${students.length} SV)`, 'green');
                return true;
            }
        }
        isFormReady = false;
        return false;
    }

    // ==================== TẠO PANEL ====================
    function createPanel() {
        if (panelCreated) return panelContainer;

        const container = document.createElement('div');
        container.id = 'auto-input-container';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            border: 2px solid #28a745;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            width: 380px;
            cursor: default;
            user-select: none;
            font-family: Arial, sans-serif;
            display: none;
        `;

        const header = document.createElement('div');
        header.id = 'husc-drag-handle';
        header.style.cssText = `
            background: #28a745;
            color: white;
            padding: 10px 12px;
            border-radius: 6px 6px 0 0;
            cursor: move;
            font-weight: bold;
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        header.innerHTML = `
            <span>📥 Nhập điểm rèn luyện</span>
            <span id="close-panel-btn" style="cursor: pointer; font-size: 16px; opacity: 0.8;">✖</span>
        `;

        const content = document.createElement('div');
        content.id = 'tool-content';
        content.style.cssText = `padding: 12px;`;

        content.innerHTML = `
            <div style="margin-bottom: 10px;">
                <div style="font-weight: bold; color: #28a745; margin-bottom: 5px; font-size: 12px;">📁 File Excel</div>
                <input type="file" id="excel-file" accept=".xlsx,.xls" style="width: 100%; padding: 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px;">
            </div>

            <div id="sheet-section" style="margin-bottom: 10px; display: none;">
                <div style="font-weight: bold; color: #28a745; margin-bottom: 5px; font-size: 12px;">📑 Sheet</div>
                <select id="sheet-select" style="width: 100%; padding: 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px;" disabled>
                    <option value="">-- Đang chờ file --</option>
                </select>
                <div id="sheet-status" style="margin-top: 3px; font-size: 10px;"></div>
            </div>

            <div style="margin-bottom: 10px;">
                <div style="font-weight: bold; color: #28a745; margin-bottom: 5px; font-size: 12px;">🔢 Cột dữ liệu</div>
                <div style="display: flex; gap: 8px;">
                    <div style="flex: 1;">
                        <input type="text" id="student-id-col" value="A" placeholder="Mã SV" style="width: 100%; padding: 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; text-align: center;">
                    </div>
                    <div style="flex: 1;">
                        <input type="text" id="score-col" value="B" placeholder="Điểm" style="width: 100%; padding: 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; text-align: center;">
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 10px;">
                <button id="load-data-btn" style="background: #28a745; color: white; border: none; padding: 6px; border-radius: 4px; flex: 1; font-size: 12px; font-weight: bold; opacity: 0.5; cursor: not-allowed;" disabled>📊 Nạp</button>
                <button id="fill-btn" style="background: #17a2b8; color: white; border: none; padding: 6px; border-radius: 4px; flex: 1; font-size: 12px; font-weight: bold; opacity: 0.5; cursor: not-allowed;" disabled>✍️ Điền</button>
                <button id="clear-highlight-btn" style="background: #6c757d; color: white; border: none; padding: 6px; border-radius: 4px; width: 36px; font-size: 12px; cursor: pointer;" title="Xóa highlight">🧹</button>
            </div>

            <div style="border: 1px solid #dee2e6; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                <div style="display: flex; background: #e9ecef;">
                    <div id="tab-stats" style="flex: 1; padding: 5px; text-align: center; cursor: pointer; font-size: 11px; background: #fff; border-bottom: 2px solid #28a745;">📊 Thống kê</div>
                    <div id="tab-result" style="flex: 1; padding: 5px; text-align: center; cursor: pointer; font-size: 11px; background: #e9ecef;">📋 Kết quả</div>
                </div>
                <div id="stats-section" style="padding: 6px; max-height: 90px; overflow-y: auto; background: #f8f9fa;">
                    <div id="stats-content" style="font-size: 11px;">⏳ Chưa có dữ liệu</div>
                </div>
                <div id="result-section" style="padding: 6px; max-height: 90px; overflow-y: auto; background: #f8f9fa; display: none;">
                    <div id="result-content" style="font-size: 11px;">⏳ Chưa điền điểm</div>
                </div>
            </div>

            <div id="panel-status" style="font-size: 10px; padding: 5px; background: #f8f9fa; border-left: 3px solid #ffc107; border-radius: 3px;">
                ⏳ Đợi form điểm rèn luyện...
            </div>
        `;

        container.appendChild(header);
        container.appendChild(content);
        document.body.appendChild(container);

        // Đóng panel
        document.getElementById('close-panel-btn').onclick = () => {
            container.style.display = 'none';
        };

        // Kéo thả
        const handle = document.getElementById('husc-drag-handle');
        if (handle) {
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

        // Tab
        const tabStats = document.getElementById('tab-stats');
        const tabResult = document.getElementById('tab-result');
        const statsSec = document.getElementById('stats-section');
        const resultSec = document.getElementById('result-section');
        if (tabStats) {
            tabStats.onclick = () => {
                tabStats.style.background = '#fff';
                tabStats.style.borderBottom = '2px solid #28a745';
                if (tabResult) { tabResult.style.background = '#e9ecef'; tabResult.style.borderBottom = 'none'; }
                statsSec.style.display = 'block';
                resultSec.style.display = 'none';
            };
        }
        if (tabResult) {
            tabResult.onclick = () => {
                tabResult.style.background = '#fff';
                tabResult.style.borderBottom = '2px solid #17a2b8';
                if (tabStats) { tabStats.style.background = '#e9ecef'; tabStats.style.borderBottom = 'none'; }
                resultSec.style.display = 'block';
                statsSec.style.display = 'none';
            };
        }

        // File input
        document.getElementById('excel-file').addEventListener('change', e => handleFileSelect(e.target.files[0]));
        document.getElementById('load-data-btn').addEventListener('click', loadDataFromSheet);
        document.getElementById('fill-btn').addEventListener('click', fillScores);
        document.getElementById('clear-highlight-btn').addEventListener('click', clearHighlights);

        panelCreated = true;
        panelContainer = container;
        return container;
    }

    function updatePanelStatus(msg, color = 'black') {
        const status = document.getElementById('panel-status');
        if (status) {
            status.innerHTML = msg;
            const colors = { green: '#28a745', red: '#dc3545', orange: '#fd7e14', blue: '#007bff' };
            status.style.borderLeftColor = colors[color] || '#ffc107';
        }
    }

    // ==================== XỬ LÝ FILE EXCEL ====================
    function handleFileSelect(file) {
        if (!file) {
            updatePanelStatus('⚠ Chọn file Excel', 'orange');
            return;
        }
        if (!file.name.match(/\.(xlsx|xls)$/i)) {
            updatePanelStatus('⚠ Chỉ hỗ trợ .xlsx/.xls', 'red');
            return;
        }

        updatePanelStatus('⏳ Đọc file...', 'blue');
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                workbookData = XLSX.read(data, {type: 'array'});
                sheetNames = workbookData.SheetNames;

                const sheetSec = document.getElementById('sheet-section');
                const sheetSelect = document.getElementById('sheet-select');
                const sheetStatus = document.getElementById('sheet-status');

                if (sheetSec) sheetSec.style.display = 'block';
                if (sheetNames.length === 0) {
                    if (sheetSelect) { sheetSelect.innerHTML = '<option>-- Không có sheet --</option>'; sheetSelect.disabled = true; }
                    if (sheetStatus) { sheetStatus.innerHTML = '❌ Không có sheet'; sheetStatus.style.color = 'red'; }
                    disableButtons(true, true);
                } else {
                    if (sheetSelect) {
                        sheetSelect.innerHTML = '';
                        sheetNames.forEach((name, idx) => {
                            const opt = document.createElement('option');
                            opt.value = idx;
                            opt.textContent = `${idx+1}. ${name}`;
                            sheetSelect.appendChild(opt);
                        });
                        sheetSelect.disabled = false;
                    }
                    if (sheetStatus) { sheetStatus.innerHTML = `✅ ${sheetNames.length} sheets`; sheetStatus.style.color = 'green'; }
                    disableButtons(false, true);
                }
                updatePanelStatus(`✅ ${file.name}`, 'green');
            } catch (error) {
                updatePanelStatus(`❌ ${error.message}`, 'red');
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function disableButtons(disableLoad, disableFill) {
        const loadBtn = document.getElementById('load-data-btn');
        const fillBtn = document.getElementById('fill-btn');
        if (loadBtn) {
            loadBtn.disabled = disableLoad;
            loadBtn.style.opacity = disableLoad ? '0.5' : '1';
            loadBtn.style.cursor = disableLoad ? 'not-allowed' : 'pointer';
        }
        if (fillBtn) {
            fillBtn.disabled = disableFill;
            fillBtn.style.opacity = disableFill ? '0.5' : '1';
            fillBtn.style.cursor = disableFill ? 'not-allowed' : 'pointer';
        }
    }

    function loadDataFromSheet() {
        try {
            if (!workbookData) {
                updatePanelStatus('⚠ Chọn file trước', 'orange');
                return;
            }
            const sheetSelect = document.getElementById('sheet-select');
            if (!sheetSelect || sheetSelect.disabled || !sheetSelect.value) {
                updatePanelStatus('⚠ Chọn sheet', 'orange');
                return;
            }

            const studentCol = document.getElementById('student-id-col').value.trim().toUpperCase();
            const scoreCol = document.getElementById('score-col').value.trim().toUpperCase();
            const studentIdx = getColIndex(studentCol);
            const scoreIdx = getColIndex(scoreCol);
            if (studentIdx === -1 || scoreIdx === -1) {
                updatePanelStatus('⚠ Cột không hợp lệ (A-Z hoặc 0-9)', 'orange');
                return;
            }

            updatePanelStatus('⏳ Đang nạp...', 'blue');
            const sheetIdx = parseInt(sheetSelect.value);
            const sheetName = sheetNames[sheetIdx];
            const sheet = workbookData.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, {header: 1});

            scoreData = {};
            let valid = 0, total = 0;

            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0) continue;
                total++;
                const studentId = row[studentIdx];
                const score = row[scoreIdx];
                if (studentId && score !== undefined && score !== '') {
                    const sid = studentId.toString().trim();
                    const s = score.toString().trim();
                    const num = parseFloat(s);
                    if (!isNaN(num) && num >= 0 && num <= 100) {
                        scoreData[sid] = s;
                        valid++;
                    }
                }
            }

            const stats = document.getElementById('stats-content');
            if (stats) {
                stats.innerHTML = `
                    <div>📑 ${sheetName}</div>
                    <div>✅ ${valid}/${total} điểm hợp lệ</div>
                    ${valid > 0 ? `<div>📝 Mẫu: ${Object.entries(scoreData).slice(0, 2).map(([k,v]) => `${k}:${v}`).join(' | ')}</div>` : ''}
                `;
            }
            document.getElementById('result-content').innerHTML = '⏳ Chưa điền điểm';
            document.getElementById('tab-stats')?.click();

            if (valid === 0) {
                updatePanelStatus('❌ Không có điểm hợp lệ (0-100)', 'red');
                disableButtons(false, true);
            } else {
                updatePanelStatus(`✅ Đã nạp ${valid} điểm`, 'green');
                disableButtons(false, false);
            }
        } catch (e) {
            updatePanelStatus(`❌ ${e.message}`, 'red');
        }
    }

    function getColIndex(col) {
        if (!col) return -1;
        if (!isNaN(col)) return parseInt(col);
        if (col.length === 1 && col.match(/[A-Z]/i)) {
            return col.toUpperCase().charCodeAt(0) - 65;
        }
        return -1;
    }

    function fillScores() {
        if (Object.keys(scoreData).length === 0) {
            updatePanelStatus('⚠ Nạp dữ liệu trước', 'orange');
            return;
        }
        if (!checkFormReady()) {
            updatePanelStatus('⚠ Chưa có form điểm!', 'orange');
            return;
        }

        updatePanelStatus('⏳ Đang điền...', 'blue');

        const students = getStudentData();
        if (students.length === 0) {
            updatePanelStatus('⚠ Không tìm thấy SV trong bảng', 'red');
            return;
        }

        clearHighlights();

        let filled = 0;
        let notFound = 0;
        const filledList = [];
        const notFoundList = [];

        students.forEach(student => {
            if (scoreData[student.id]) {
                student.input.value = scoreData[student.id];
                student.input.dispatchEvent(new Event('input', { bubbles: true }));
                student.input.dispatchEvent(new Event('change', { bubbles: true }));
                student.input.style.backgroundColor = '#e8f5e8';
                filled++;
                if (filledList.length < 5) filledList.push(student.id);
            } else {
                student.input.style.backgroundColor = '#fff3cd';
                notFound++;
                if (notFoundList.length < 5) notFoundList.push(student.id);
            }
        });

        const result = document.getElementById('result-content');
        if (result) {
            result.innerHTML = `
                <div>✅ Đã điền: <strong style="color:#28a745;">${filled}</strong></div>
                <div>⚠ Không có: <strong style="color:#fd7e14;">${notFound}</strong></div>
                ${filledList.length ? `<div>📝 ${filledList.join(', ')}</div>` : ''}
                ${notFoundList.length ? `<div>🔍 ${notFoundList.join(', ')}</div>` : ''}
            `;
        }
        document.getElementById('tab-result')?.click();

        updatePanelStatus(filled > 0 ? `✅ Đã điền ${filled} điểm` : '❌ Không điền được điểm', filled > 0 ? 'green' : 'red');
    }

    function clearHighlights() {
        const inputs = document.querySelectorAll('#formConductMarksInput input');
        inputs.forEach(input => input.style.backgroundColor = '');
        updatePanelStatus('🧹 Đã xóa highlight', 'blue');
    }

    // ==================== THEO DÕI NÚT "NHẬP ĐIỂM RÈN LUYỆN" ====================
    function findAndObserveConductMarkButton() {
        // Tìm nút "Nhập điểm rèn luyện" (có thể có text khác nhau)
        const buttons = document.querySelectorAll('a, button');
        let conductBtn = null;

        for (const btn of buttons) {
            const text = btn.textContent.trim();
            if (text.includes('Nhập điểm rèn luyện') ||
                text.includes('nhập điểm rèn luyện') ||
                (text.includes('Điểm rèn luyện') && text.includes('Nhập'))) {
                conductBtn = btn;
                break;
            }
        }

        if (conductBtn) {
            console.log('✅ Tìm thấy nút "Nhập điểm rèn luyện"');

            // Thêm sự kiện click để hiển thị panel
            const originalClick = conductBtn.onclick;
            conductBtn.addEventListener('click', function(e) {
                console.log('🖱️ Người dùng click "Nhập điểm rèn luyện"');
                // Tạo và hiển thị panel
                const panel = createPanel();
                if (panel) {
                    panel.style.display = 'block';
                    // Đợi form load rồi kiểm tra
                    setTimeout(() => {
                        checkFormReady();
                        // Nếu chưa có form, tiếp tục theo dõi
                        if (!isFormReady) {
                            observeFormLoading();
                        }
                    }, 800);
                }
            });

            return true;
        }
        return false;
    }

    // ==================== THEO DÕI FORM ĐANG LOAD ====================
    function observeFormLoading() {
        const target = document.getElementById('consultantDataContent');
        if (!target) return;

        let observer = null;
        const checkInterval = setInterval(() => {
            if (checkFormReady()) {
                clearInterval(checkInterval);
                if (observer) observer.disconnect();
                console.log('✅ Form điểm đã sẵn sàng');
                disableButtons(false, true);
            }
        }, 500);

        // Dừng sau 30 giây
        setTimeout(() => {
            clearInterval(checkInterval);
        }, 30000);

        observer = new MutationObserver(() => {
            if (checkFormReady()) {
                clearInterval(checkInterval);
                observer.disconnect();
            }
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    // ==================== THEO DÕI THAY ĐỔI NỘI DUNG ====================
    function observeContentChanges() {
        const target = document.getElementById('consultantDataContent');
        if (!target) return;

        const observer = new MutationObserver(() => {
            // Khi nội dung thay đổi, kiểm tra lại nút "Nhập điểm rèn luyện"
            findAndObserveConductMarkButton();
        });
        observer.observe(target, { childList: true, subtree: true });
    }

    // ==================== KHỞI TẠO ====================
    function init() {
        console.log('🎯 Khởi tạo script...');

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(run, 500));
        } else {
            setTimeout(run, 500);
        }
    }

    function run() {
        console.log('🏃 Chạy script...');

        // Tìm nút "Nhập điểm rèn luyện" và gắn sự kiện
        findAndObserveConductMarkButton();

        // Theo dõi thay đổi nội dung để bắt nút được tải động
        observeContentChanges();

        // Thêm CSS
        const style = document.createElement('style');
        style.textContent = `
            #auto-input-container { transition: box-shadow 0.2s; animation: slideIn 0.3s; }
            @keyframes slideIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
            #auto-input-container:hover { box-shadow: 0 8px 16px rgba(0,0,0,0.2); }
            input { transition: background-color 0.3s; }
        `;
        document.head.appendChild(style);

        console.log('🎉 Script sẵn sàng! Panel sẽ hiện khi click "Nhập điểm rèn luyện"');
    }

    init();

})();
