// Admin state
let orders = [];
let staffCalls = [];
let currentFilter = 'all';
let soundEnabled = true;

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
const tabButtons = document.querySelectorAll('.tab-btn');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const orderDetailModal = document.getElementById('orderDetailModal');
const closeDetailModal = document.getElementById('closeDetailModal');
const orderDetailContent = document.getElementById('orderDetailContent');
const soundToggle = document.getElementById('soundToggle');

// Load orders from API
async function loadOrders() {
    try {
        orders = await apiClient.getOrders(currentFilter);
        updateStats();
        renderOrders();
    } catch (error) {
        console.error('Error loading orders:', error);
        ordersListEl.innerHTML = '<div class="empty-state"><p>❌ 주문을 불러오는데 실패했습니다</p></div>';
    }
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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    updateClock();
    
    // Update clock every second
    setInterval(updateClock, 1000);
    
    // Load initial orders and staff calls
    await loadOrders();
    await loadStaffCalls();
    
    // Connect WebSocket for real-time updates
    apiClient.connectWebSocket(handleWebSocketMessage);
    
    // Tab buttons
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.status;
            renderOrders();
        });
    });
    
    // Clear buttons
    if (clearCompletedBtn) {
        clearCompletedBtn.addEventListener('click', clearCompletedOrders);
    }
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', clearAllOrders);
    }
    
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
});

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    console.log('WebSocket message:', data);
    
    switch (data.type) {
        case 'new_order':
            // Add new order to the list
            orders.unshift(data.order);
            updateStats();
            renderOrders();
            
            // Play notification sound
            if (soundEnabled) {
                playNotificationSound();
            }
            
            // Show notification
            showNotification(`새 주문! 테이블 ${data.order.tableNumber}`);
            break;
        
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
            // Remove order from list
            orders = orders.filter(o => o.id !== data.orderId);
            updateStats();
            renderOrders();
            break;
            
        case 'completed_orders_cleared':
            // Remove completed orders
            orders = orders.filter(o => o.status !== 'completed');
            updateStats();
            renderOrders();
            break;
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

// Play notification sound
function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.error('Error playing sound:', error);
    }
}

// Show notification
function showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('새 주문 알림', {
            body: message,
            icon: '🔔'
        });
    }
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

// Render orders
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
    
    filteredOrders.forEach(order => {
        const orderCard = createOrderCard(order);
        ordersListEl.appendChild(orderCard);
    });
}

// Create order card
function createOrderCard(order) {
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
            <button class="action-btn btn-accept" onclick="acceptOrder('${order.id}')">접수</button>
            <button class="action-btn btn-cancel" onclick="cancelOrder('${order.id}')">취소</button>
        `;
    } else if (order.status === 'cooking') {
        actionsHTML = `
            <button class="action-btn btn-complete" onclick="completeOrder('${order.id}')">완료</button>
        `;
    }
    actionsHTML += `<button class="action-btn btn-view" onclick="viewOrderDetail('${order.id}')">상세</button>`;
    
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
            <span class="order-total">총 ${formatPrice(order.total)}</span>
            <div class="order-actions">
                ${actionsHTML}
            </div>
        </div>
    `;
    
    return card;
}

// Render staff calls
function renderStaffCalls() {
    const pendingCalls = staffCalls.filter(call => call.status === 'pending');
    
    if (callCountEl) {
        callCountEl.textContent = pendingCalls.length;
    }
    
    if (!staffCallsListEl) return;
    
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
                <div class="call-table">테이블 ${call.table_number}</div>
                <div class="call-time">${callTime}</div>
            </div>
            <div class="call-message">${call.message}</div>
            <button class="btn btn-complete" onclick="completeStaffCall('${call.id}')">
                ✅ 완료
            </button>
        `;
        
        staffCallsListEl.appendChild(callDiv);
    });
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

// Format price
function formatPrice(price) {
    return Math.round(parseFloat(price)).toLocaleString('ko-KR') + '원';
}

// Make functions global
window.acceptOrder = acceptOrder;
window.completeOrder = completeOrder;
window.cancelOrder = cancelOrder;
window.viewOrderDetail = viewOrderDetail;
window.completeStaffCall = completeStaffCall;

// Made with Bob
