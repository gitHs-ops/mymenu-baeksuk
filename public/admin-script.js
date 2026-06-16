// Admin state
let orders = [];
let staffCalls = [];
let currentFilter = 'all';
let soundEnabled = true;
let selectedDate = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();

// DOM elements
const currentTimeEl = document.getElementById('currentTime');
const pendingCountEl = document.getElementById('pendingCount');
const totalOrdersEl = document.getElementById('totalOrders');
const pendingOrdersEl = document.getElementById('pendingOrders');
const cookingOrdersEl = document.getElementById('cookingOrders');
const completedOrdersEl = document.getElementById('completedOrders');
const totalRevenueEl = document.getElementById('totalRevenue');
const ordersListEl = document.getElementById('ordersList');
const staffCallsListEl = document.getElementById('staffCallsList');
const callCountEl = document.getElementById('callCount');
const statFilters = document.querySelectorAll('.stat-filter');
const callCountHeaderEl = document.getElementById('callCountHeader');
const orderDetailModal = document.getElementById('orderDetailModal');
const closeDetailModal = document.getElementById('closeDetailModal');
const orderDetailContent = document.getElementById('orderDetailContent');
const soundToggle = document.getElementById('soundToggle');
// staffCall 관련 요소는 DOMContentLoaded 안에서 참조
let staffCallViewActive = false;
let staffCallToggleBtn, pendingToggleBtn, ordersSectionEl, statsDashboardEl, orderStatsEl;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // 업무개시 팝업 — 클릭으로 AudioContext 초기화
    document.getElementById('startWorkBtn').addEventListener('click', () => {
        _initAudio();
        document.getElementById('startWorkOverlay').style.display = 'none';
    });

    // 직원 호출 관련 DOM 요소 할당
    staffCallToggleBtn = document.getElementById('staffCallToggle');
    pendingToggleBtn = document.getElementById('pendingToggle');
    ordersSectionEl = document.querySelector('.orders-section');
    statsDashboardEl = document.querySelector('.stats-dashboard');
    orderStatsEl = document.querySelector('.order-stats');

    updateClock();

    // Update clock every second
    setInterval(updateClock, 1000);

    // Date picker setup
    const dateFilterEl = document.getElementById('dateFilter');
    dateFilterEl.value = selectedDate;

    let dateChanging = false;

    function setDate(newDate) {
        const y = newDate.getFullYear();
        const m = String(newDate.getMonth() + 1).padStart(2, '0');
        const d = String(newDate.getDate()).padStart(2, '0');
        selectedDate = `${y}-${m}-${d}`;
        dateChanging = true;
        dateFilterEl.value = selectedDate;
        dateChanging = false;
        loadOrders();
    }

    dateFilterEl.addEventListener('change', () => {
        if (dateChanging) return;
        selectedDate = dateFilterEl.value;
        loadOrders();
    });

    document.getElementById('prevDay').addEventListener('click', () => {
        const [y, m, d] = selectedDate.split('-').map(Number);
        setDate(new Date(y, m - 1, d - 1));
    });

    document.getElementById('nextDay').addEventListener('click', () => {
        const [y, m, d] = selectedDate.split('-').map(Number);
        setDate(new Date(y, m - 1, d + 1));
    });

    document.getElementById('todayBtn').addEventListener('click', () => {
        setDate(new Date());
    });

    // Load initial orders and staff calls
    await loadOrders();
    await loadStaffCalls();

    // Connect WebSocket for real-time updates
    apiClient.connectWebSocket(handleWebSocketMessage);

    // Stat card filter
    statFilters.forEach(card => {
        card.addEventListener('click', () => {
            statFilters.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentFilter = card.dataset.status;
            renderOrders();
            // 직원 호출 뷰 활성화 상태면 복귀
            if (staffCallViewActive) toggleStaffCallView(false);
        });
    });

    // 대기 버튼 → 주문 목록 + 대기중 필터
    pendingToggleBtn.addEventListener('click', () => {
        toggleStaffCallView(false);
        currentFilter = 'pending';
        statFilters.forEach(c => c.classList.toggle('active', c.dataset.status === 'pending'));
        renderOrders();
    });

    // 직원 호출 버튼 → 직원 호출 목록 표시
    staffCallToggleBtn.addEventListener('click', () => {
        toggleStaffCallView(true);
    });

    // Modal close
    closeDetailModal.addEventListener('click', closeModal);
    orderDetailModal.addEventListener('click', (e) => {
        if (e.target === orderDetailModal) closeModal();
    });

    // Sound toggle
    soundToggle.addEventListener('click', toggleSound);

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Wake Lock — 화면 꺼짐 방지
    acquireWakeLock();
});

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    console.log('WebSocket message:', data);

    switch (data.type) {
        case 'new_order': {
            if (soundEnabled) playNotificationSound();
            const _tableNum = data.order.table_number || data.order.tableNumber;
            showNotification(`새 주문! 테이블 ${_tableNum}`);
            // staff_call과 동일 방식: 배열 직접 수정 → 즉시 렌더 (API 재호출 없음)
            if (!orders.find(o => o.id === data.order.id)) {
                orders.unshift(data.order);
                updateStats();
                renderOrders();
            }
            break;
        }

        case 'staff_call':
            // Add new staff call
            staffCalls.unshift(data.call);
            renderStaffCalls();

            // Play notification sound
            if (soundEnabled) {
                playNotificationSound();
            }

            // Show notification
            showNotification(`🔔 테이블 ${data.call.table_number}: ${data.call.message}`);
            break;

        case 'order_status_update':
            // Update order status
            const orderToUpdate = orders.find(o => o.id === data.orderId);
            if (orderToUpdate) {
                orderToUpdate.status = data.status;
                if (data.completedAt) {
                    orderToUpdate.completed_at = data.completedAt;
                }
                updateStats();
                renderOrders();
            }
            break;

        case 'order_deleted':
            const deletedOrder = orders.find(o => o.id === data.orderId);
            if (deletedOrder) {
                if (soundEnabled) playNotificationSound();
                showNotification(`❌ 주문 취소! 테이블 ${deletedOrder.table_number}`);
            }
            orders = orders.filter(o => o.id !== data.orderId);
            updateStats();
            renderOrders();
            break;

        case 'order_updated':
            const updatedOrder = orders.find(o => o.id === data.orderId);
            if (updatedOrder) {
                updatedOrder.items = data.items;
                updatedOrder.total = data.total;
                if (soundEnabled) playNotificationSound();
                showNotification(`✏️ 주문 변경! 테이블 ${updatedOrder.table_number}`);
                updateStats();
                renderOrders();
            }
            break;

        case 'completed_orders_cleared':
            // Remove completed orders
            orders = orders.filter(o => o.status !== 'completed');
            updateStats();
            renderOrders();
            break;

        case 'table_cleared':
            showNotification(`🧾 테이블 ${data.tableNumber} 마감 (${data.clearedCount}건)`);
            break;
    }
}

// Load orders from API
async function loadOrders() {
    try {
        orders = await apiClient.getOrders(currentFilter, selectedDate);
        updateStats();
        renderOrders();
    } catch (error) {
        console.error('Error loading orders:', error);
        ordersListEl.innerHTML = '<div class="empty-state"><p>❌ 주문을 불러오는데 실패했습니다</p></div>';
    }
}

// Update clock
function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    currentTimeEl.textContent = timeString;
}

// ── Wake Lock ──────────────────────────────────────────────
let wakeLock = null;
async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        document.getElementById('wakeLockIndicator').style.display = 'block';
        wakeLock.addEventListener('release', () => {
            wakeLock = null;
            document.getElementById('wakeLockIndicator').style.display = 'none';
        });
    } catch (e) {
        // 권한 거부 or 미지원 — 조용히 무시
    }
}
// 탭이 다시 활성화되면 wake lock 재획득
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeLock) acquireWakeLock();
});

// ── Audio — 첫 터치 시 AudioContext 생성 + 차임 버퍼 미리 렌더링
let _audioCtx = null;
let _chimeBuffer = null;

function _buildChimeBuffer(ctx) {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.ceil(1.4 * sr), sr);
    const d = buf.getChannelData(0);
    [{ freq: 600, t0: 0.0 }, { freq: 800, t0: 0.45 }, { freq: 1000, t0: 0.9 }]
        .forEach(({ freq, t0 }) => {
            const s0 = Math.floor(t0 * sr);
            for (let i = 0; i < Math.floor(0.4 * sr) && s0 + i < d.length; i++) {
                const t = i / sr;
                d[s0 + i] += 0.35 * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 8);
            }
        });
    return buf;
}

function _initAudio() {
    if (_audioCtx) return;
    try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        _chimeBuffer = _buildChimeBuffer(_audioCtx);
    } catch (e) {}
}
// 첫 터치/클릭 시 AudioContext 생성 (모바일 gesture 정책)
['click', 'touchstart'].forEach(evt => document.addEventListener(evt, _initAudio));

// Play notification sound + vibration
async function playNotificationSound() {
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 300]);
    if (!_audioCtx || !_chimeBuffer) return;
    try {
        if (_audioCtx.state === 'suspended') await _audioCtx.resume();
        const src = _audioCtx.createBufferSource();
        src.buffer = _chimeBuffer;
        src.connect(_audioCtx.destination);
        src.start(0);
    } catch (error) {
        console.error('Sound error:', error);
    }
}

// Show notification (in-page toast + optional browser notification)
function showNotification(message) {
    showToast(message);
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('주문 알림', {
            body: message,
            icon: '🔔'
        });
    }
}

function showToast(message) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = 'background:#333;color:#fff;padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);font-size:15px;font-weight:600;opacity:0;transform:translateX(20px);transition:opacity .25s,transform .25s;pointer-events:auto;max-width:360px;';
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Toggle sound
function toggleSound() {
    soundEnabled = !soundEnabled;
    soundToggle.classList.toggle('muted', !soundEnabled);
    soundToggle.textContent = soundEnabled ? '🔔' : '🔕';
}

// Update statistics
function updateStats() {
    const pending = orders.filter(o => o.status === 'pending').length;
    const cooking = orders.filter(o => o.status === 'cooking').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const total = orders.length;
    const revenue = orders.reduce((sum, order) => sum + parseFloat(order.total), 0);

    totalOrdersEl.textContent = total;
    pendingOrdersEl.textContent = pending;
    cookingOrdersEl.textContent = cooking;
    completedOrdersEl.textContent = completed;
    totalRevenueEl.textContent = formatPrice(revenue);
    pendingCountEl.textContent = pending;
}

// Render orders — grouped by table + session (cleared_at)
function renderOrders() {
    let filteredOrders = orders;

    if (currentFilter !== 'all') {
        filteredOrders = orders.filter(o => o.status === currentFilter);
    }

    if (filteredOrders.length === 0) {
        ordersListEl.innerHTML = '<div class="empty-state"><p>📭 주문이 없습니다</p></div>';
        return;
    }

    ordersListEl.innerHTML = '';

    // 테이블 + cleared_at 으로 세션 그룹핑
    const groups = new Map();
    filteredOrders.forEach(o => {
        const sessionKey = `${o.table_number}__${o.cleared_at || 'active'}`;
        if (!groups.has(sessionKey)) groups.set(sessionKey, { tableNumber: o.table_number, clearedAt: o.cleared_at, orders: [] });
        groups.get(sessionKey).orders.push(o);
    });

    // 정렬: 현재 세션(active) 우선, 이후 최근 주문 시간 desc
    const sorted = [...groups.values()].sort((a, b) => {
        if (!a.clearedAt && b.clearedAt) return -1;
        if (a.clearedAt && !b.clearedAt) return 1;
        const aLatest = Math.max(...a.orders.map(o => new Date(o.created_at).getTime()));
        const bLatest = Math.max(...b.orders.map(o => new Date(o.created_at).getTime()));
        return bLatest - aLatest;
    });

    sorted.forEach(({ tableNumber, clearedAt, orders: tableOrders }) => {
        tableOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const group = document.createElement('div');
        group.className = 'table-group' + (clearedAt ? ' session-closed' : '');

        const tableTotal = tableOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
        const hasCompleted = tableOrders.some(o => o.status === 'completed' && !o.cleared_at);
        const allTerminal = tableOrders.every(o => o.status === 'completed' || o.status === 'cancelled');

        const sessionLabel = clearedAt
            ? `<span class="session-closed-badge">마감 ${new Date(clearedAt).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>`
            : '';

        const header = document.createElement('div');
        header.className = 'table-group-header';
        header.innerHTML = `
            <div class="table-group-title">
                <span class="table-group-num">테이블 ${tableNumber}</span>
                ${sessionLabel}
                <span class="table-group-count">${tableOrders.length}건</span>
            </div>
            <div class="table-group-actions">
                ${hasCompleted ? `<button class="action-btn btn-clear" onclick="clearTable(${tableNumber})"><i data-lucide="receipt"></i> 테이블 마감</button>` : ''}
            </div>
        `;
        if (allTerminal) header.classList.add('all-done');
        group.appendChild(header);

        tableOrders.forEach(order => {
            group.appendChild(createOrderCard(order, tableOrders.length));
        });

        // 주문 2건 이상일 때만 카드 하단에 총 금액 표시
        if (tableOrders.length > 1) {
            const totalFooter = document.createElement('div');
            totalFooter.className = 'table-group-total-footer';
            totalFooter.innerHTML = `<span class="group-total-label">합계</span><span class="group-total-amount">${formatPrice(tableTotal)}</span>`;
            group.appendChild(totalFooter);
        }

        ordersListEl.appendChild(group);
    });

    lucide.createIcons();
}

// Create order card
function createOrderCard(order, sessionOrderCount = 1) {
    const card = document.createElement('div');
    card.className = `order-card ${order.status}`;

    const orderTime = new Date(order.created_at).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    const statusText = {
        pending: '대기중',
        cooking: '조리중',
        completed: '완료'
    };

    let itemsHTML = '';
    order.items.forEach(item => {
        itemsHTML += `
            <div class="order-item">
                <span class="item-name">${item.name}</span>
                <span class="item-quantity">${item.quantity}개 × ${formatPrice(item.price)}</span>
            </div>
        `;
    });

    let actionsHTML = '';
    if (order.status === 'pending') {
        actionsHTML = `
            <button class="action-btn btn-accept" onclick="acceptOrder('${order.id}')"><i data-lucide="check"></i> 접수</button>
            <button class="action-btn btn-cancel" onclick="cancelOrder('${order.id}')"><i data-lucide="x"></i> 취소</button>
        `;
    } else if (order.status === 'cooking') {
        actionsHTML = `
            <button class="action-btn btn-complete" onclick="completeOrder('${order.id}')"><i data-lucide="check-circle"></i> 완료</button>
        `;
    }
    actionsHTML += `<button class="action-btn btn-view" onclick="viewOrderDetail('${order.id}')"><i data-lucide="eye"></i> 상세</button>`;
    if (order.status !== 'pending') {
        actionsHTML += `<button class="action-btn btn-delete" onclick="deleteOrder('${order.id}')"><i data-lucide="trash-2"></i></button>`;
    }

    card.innerHTML = `
        <div class="order-header">
            <div class="order-info">
                <span class="table-number">테이블 ${order.table_number}</span>
                <span class="order-time">${orderTime}</span>
            </div>
            <span class="order-status ${order.status}">${statusText[order.status]}</span>
        </div>
        <div class="order-items">
            ${itemsHTML}
        </div>
        <div class="order-footer">
            <span class="order-total">${sessionOrderCount === 1 ? '합계' : '소계'} ${formatPrice(order.total)}</span>
            <div class="order-actions">
                ${actionsHTML}
            </div>
        </div>
    `;

    return card;
}

// Accept order
async function acceptOrder(orderId) {
    try {
        await apiClient.updateOrderStatus(orderId, 'cooking');
        const order = orders.find(o => o.id === orderId);
        if (order) {
            order.status = 'cooking';
            updateStats();
            renderOrders();
        }
    } catch (error) {
        console.error('Error accepting order:', error);
        alert('주문 접수 중 오류가 발생했습니다.');
    }
}

// Complete order
async function completeOrder(orderId) {
    try {
        await apiClient.updateOrderStatus(orderId, 'completed');
        const order = orders.find(o => o.id === orderId);
        if (order) {
            order.status = 'completed';
            order.completed_at = new Date().toISOString();
            updateStats();
            renderOrders();
        }
    } catch (error) {
        console.error('Error completing order:', error);
        alert('주문 완료 처리 중 오류가 발생했습니다.');
    }
}

// Cancel order
async function cancelOrder(orderId) {
    if (confirm('이 주문을 취소하시겠습니까?')) {
        try {
            await apiClient.deleteOrder(orderId);
            orders = orders.filter(o => o.id !== orderId);
            updateStats();
            renderOrders();
        } catch (error) {
            console.error('Error cancelling order:', error);
            alert('주문 취소 중 오류가 발생했습니다.');
        }
    }
}

// Delete order
async function deleteOrder(orderId) {
    if (confirm('이 주문을 삭제하시겠습니까?')) {
        try {
            await apiClient.deleteOrder(orderId);
            orders = orders.filter(o => o.id !== orderId);
            updateStats();
            renderOrders();
        } catch (error) {
            console.error('Error deleting order:', error);
            alert('주문 삭제 중 오류가 발생했습니다.');
        }
    }
}

// View order detail
function viewOrderDetail(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const orderTime = new Date(order.created_at).toLocaleString('ko-KR');
    const statusText = {
        pending: '대기중',
        cooking: '조리중',
        completed: '완료'
    };

    let itemsHTML = '';
    order.items.forEach(item => {
        const itemTotal = item.price * item.quantity;
        itemsHTML += `
            <div class="order-item">
                <div>
                    <div class="item-name">${item.name}</div>
                    <div class="item-quantity">${formatPrice(item.price)} × ${item.quantity}개</div>
                </div>
                <div style="font-weight: bold;">${formatPrice(itemTotal)}</div>
            </div>
        `;
    });

    orderDetailContent.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 10px;">주문 정보</h3>
            <p><strong>테이블:</strong> ${order.table_number}번</p>
            <p><strong>주문 시간:</strong> ${orderTime}</p>
            <p><strong>상태:</strong> <span class="order-status ${order.status}">${statusText[order.status]}</span></p>
        </div>
        <div style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 10px;">주문 내역</h3>
            <div class="order-items">
                ${itemsHTML}
            </div>
        </div>
        <div style="padding-top: 15px; border-top: 2px solid #e0e0e0;">
            <div style="display: flex; justify-content: space-between; font-size: 1.3em; font-weight: bold;">
                <span>총 금액:</span>
                <span style="color: #667eea;">${formatPrice(order.total)}</span>
            </div>
        </div>
    `;

    orderDetailModal.classList.add('active');
}

// Close modal
function closeModal() {
    orderDetailModal.classList.remove('active');
}

// Load staff calls
async function loadStaffCalls() {
    try {
        staffCalls = await apiClient.getStaffCalls();
        renderStaffCalls();
    } catch (error) {
        console.error('Error loading staff calls:', error);
        if (staffCallsListEl) {
            staffCallsListEl.innerHTML = '<div class="empty-state"><p>호출을 불러오는데 실패했습니다</p></div>';
        }
    }
}

// Render staff calls
function renderStaffCalls() {
    if (!staffCallsListEl || !callCountEl) return;

    const pendingCalls = staffCalls.filter(call => call.status === 'pending');
    callCountEl.textContent = pendingCalls.length;
    if (callCountHeaderEl) callCountHeaderEl.textContent = pendingCalls.length;

    if (pendingCalls.length === 0) {
        staffCallsListEl.innerHTML = '<div class="empty-state"><p>호출이 없습니다</p></div>';
        return;
    }

    staffCallsListEl.innerHTML = '';

    pendingCalls.forEach(call => {
        const callTime = new Date(call.created_at).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const callDiv = document.createElement('div');
        callDiv.className = 'staff-call-card';
        callDiv.innerHTML = `
            <div class="call-header">
                <div class="call-table"><i data-lucide="hash"></i> 테이블 ${call.table_number}</div>
                <div class="call-time">${callTime}</div>
            </div>
            <div class="call-message">${call.message}</div>
            <button class="btn btn-complete" onclick="completeStaffCall('${call.id}')">
                <i data-lucide="check-circle"></i> 완료
            </button>
        `;

        staffCallsListEl.appendChild(callDiv);
    });

    lucide.createIcons();
}

// Complete staff call
async function completeStaffCall(callId) {
    try {
        await apiClient.updateStaffCallStatus(callId, 'completed');

        // Remove from list
        staffCalls = staffCalls.filter(call => call.id !== callId);
        renderStaffCalls();
    } catch (error) {
        console.error('Error completing staff call:', error);
        alert('호출 완료 처리에 실패했습니다.');
    }
}

// Clear completed orders
async function clearCompletedOrders() {
    const completedCount = orders.filter(o => o.status === 'completed').length;
    if (completedCount === 0) {
        alert('완료된 주문이 없습니다.');
        return;
    }

    if (confirm(`완료된 주문 ${completedCount}개를 삭제하시겠습니까?`)) {
        try {
            await apiClient.deleteCompletedOrders();
            orders = orders.filter(o => o.status !== 'completed');
            updateStats();
            renderOrders();
        } catch (error) {
            console.error('Error clearing completed orders:', error);
            alert('완료 주문 삭제 중 오류가 발생했습니다.');
        }
    }
}

// Clear all orders
async function clearAllOrders() {
    if (orders.length === 0) {
        alert('주문이 없습니다.');
        return;
    }

    if (confirm('모든 주문을 삭제하시겠습니까?')) {
        try {
            // Delete all orders one by one
            for (const order of orders) {
                await apiClient.deleteOrder(order.id);
            }
            orders = [];
            updateStats();
            renderOrders();
        } catch (error) {
            console.error('Error clearing all orders:', error);
            alert('주문 삭제 중 오류가 발생했습니다.');
        }
    }
}

// Local date helpers (UTC 변환 없이 로컬 날짜 처리)
function localDate(dateStr, offset = 0) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d + offset);
}

function localDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Toggle staff call view
function toggleStaffCallView(show) {
    staffCallViewActive = show;
    staffCallToggleBtn.classList.toggle('active', show);
    pendingToggleBtn.classList.toggle('active', !show);
    ordersSectionEl.style.display = show ? 'none' : '';
    statsDashboardEl.style.display = show ? 'none' : '';
    orderStatsEl.style.display = show ? 'none' : '';
}

// Format price
function formatPrice(price) {
    return Math.round(parseFloat(price)).toLocaleString('ko-KR') + '원';
}

// Make functions global
window.acceptOrder = acceptOrder;
window.completeOrder = completeOrder;
window.cancelOrder = cancelOrder;
window.deleteOrder = deleteOrder;
window.viewOrderDetail = viewOrderDetail;
window.completeStaffCall = completeStaffCall;
window.clearTable = clearTable;

async function clearTable(tableNumber) {
    if (!confirm(`테이블 ${tableNumber}의 현재 세션을 마감하시겠습니까?\n(통계는 유지되며, 새 손님은 이전 주문을 보지 않습니다.)`)) {
        return;
    }
    try {
        await apiClient.clearTable(tableNumber);
        await loadOrders();
    } catch (error) {
        console.error('Error clearing table:', error);
        alert('테이블 마감에 실패했습니다.');
    }
}

// Made with Bob
