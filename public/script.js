// Cart state
let cart = [];
let tableNumber = getTableNumberFromURL() || Math.floor(Math.random() * 20) + 1;
let pendingOrderId = null;
let pendingOrderTotal = 0;

const CATEGORY_ICONS = {
    '메인메뉴': '🍲',
    '특선':    '⭐',
    '추가메뉴': '🦐',
    '사이드':  '🥗',
    '주류':    '🍺',
};

// Get table number from URL parameter
function getTableNumberFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get('table');
    return table ? parseInt(table) : null;
}

// DOM elements
const cartButton = document.getElementById('cartButton');
const cartModal = document.getElementById('cartModal');
const confirmModal = document.getElementById('confirmModal');
const closeModal = document.getElementById('closeModal');
const cartCount = document.getElementById('cartCount');
const cartItems = document.getElementById('cartItems');
const totalPrice = document.getElementById('totalPrice');
const clearCartBtn = document.getElementById('clearCart');
const orderButton = document.getElementById('orderButton');
const closeConfirm = document.getElementById('closeConfirm');
const tableNumberSpan = document.getElementById('tableNumber');
const historyButton = document.getElementById('historyButton');
const historyModal = document.getElementById('historyModal');
const closeHistory = document.getElementById('closeHistory');
const historyItems = document.getElementById('historyItems');
const historyTableNumber = document.getElementById('historyTableNumber');
const staffCallBtn = document.getElementById('staffCallBtn');
const staffCallModal = document.getElementById('staffCallModal');
const closeStaffCall = document.getElementById('closeStaffCall');
const staffCallConfirmModal = document.getElementById('staffCallConfirmModal');
const closeStaffCallConfirm = document.getElementById('closeStaffCallConfirm');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Display table number
    tableNumberSpan.textContent = tableNumber;

    // Load menu from API
    await loadMenu();

    // 직원 호출 직접 입력 버튼 이벤트
    const sendCustomCallBtn = document.getElementById('sendCustomCall');
    const customCallInput = document.getElementById('customCallMessage');
    if (sendCustomCallBtn && customCallInput) {
        sendCustomCallBtn.addEventListener('click', () => {
            const message = customCallInput.value.trim();
            if (message) {
                sendStaffCall(message);
                customCallInput.value = '';
            }
        });
        
        customCallInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendCustomCallBtn.click();
            }
        });
    }

    // Cart button click
    cartButton.addEventListener('click', openCart);

    // Close modal
    closeModal.addEventListener('click', closeCart);

    // Clear cart
    clearCartBtn.addEventListener('click', clearCart);

    // Order button
    orderButton.addEventListener('click', placeOrder);

    // Close confirmation
    closeConfirm.addEventListener('click', closeConfirmation);

    // Close modal when clicking outside
    cartModal.addEventListener('click', (e) => {
        if (e.target === cartModal) {
            closeCart();
        }
    });

    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) {
            closeConfirmation();
        }
    });

    // History button click
    historyButton.addEventListener('click', openHistory);
    closeHistory.addEventListener('click', closeHistoryModal);
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) {
            closeHistoryModal();
        }
    });

    // Staff call button click
    staffCallBtn.addEventListener('click', openStaffCallModal);
    closeStaffCall.addEventListener('click', closeStaffCallModalFunc);
    staffCallModal.addEventListener('click', (e) => {
        if (e.target === staffCallModal) {
            closeStaffCallModalFunc();
        }
    });

    // Staff call options click
    const staffCallOptions = document.querySelectorAll('.staff-call-option');
    staffCallOptions.forEach(option => {
        option.addEventListener('click', handleStaffCall);
    });

    // Close staff call confirmation
    closeStaffCallConfirm.addEventListener('click', closeStaffCallConfirmation);
    staffCallConfirmModal.addEventListener('click', (e) => {
        if (e.target === staffCallConfirmModal) {
            closeStaffCallConfirmation();
        }
    });

    // Payment method modal
    const paymentMethodModal = document.getElementById('paymentMethodModal');
    document.getElementById('closePaymentMethod').addEventListener('click', () => {
        paymentMethodModal.classList.remove('active');
    });
    paymentMethodModal.addEventListener('click', (e) => {
        if (e.target === paymentMethodModal) paymentMethodModal.classList.remove('active');
    });
    document.querySelectorAll('.pay-method').forEach(btn => {
        btn.addEventListener('click', () => {
            paymentMethodModal.classList.remove('active');
            startPayment(btn.dataset.method);
        });
    });

    // 결제하기 버튼 → 결제수단 모달
    document.getElementById('gotoPaymentBtn').addEventListener('click', () => {
        closeConfirmation();
        document.getElementById('paymentAmount').textContent = pendingOrderTotal.toLocaleString('ko-KR');
        document.getElementById('paymentMethodModal').classList.add('active');
    });

    // Handle return from Toss (success/fail redirect)
    handlePaymentReturn();

    // Register table session
    initSession();
});

// Load menu items
async function loadMenu() {
    try {
        const menuItems = await apiClient.getAllMenu();
        renderMenu(menuItems);
    } catch (error) {
        console.error('Error loading menu:', error);
        document.getElementById('menuContainer').innerHTML = '<div class="menu-loading">메뉴를 불러오는 중 오류가 발생했습니다.</div>';
    }
}

// Render menu categories and items
function renderMenu(menuItems) {
    const menuContainer = document.getElementById('menuContainer');
    const categoryNav = document.getElementById('categoryNav');
    
    if (!menuItems || menuItems.length === 0) {
        menuContainer.innerHTML = '<div class="menu-loading">등록된 메뉴가 없습니다.</div>';
        return;
    }

    // Group items by category
    const categories = {};
    menuItems.forEach(item => {
        if (!categories[item.category]) {
            categories[item.category] = [];
        }
        categories[item.category].push(item);
    });

    // Render category buttons
    const categoryList = Object.keys(categories);
    const existingButtons = categoryNav.querySelectorAll('.category-btn');
    existingButtons.forEach(btn => {
        if (btn.dataset.category !== 'all') btn.remove();
    });

    categoryList.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.dataset.category = cat;
        btn.innerHTML = `<span class="cat-emoji">${CATEGORY_ICONS[cat] || '🍽️'}</span><span class="cat-text">${cat}</span>`;
        btn.onclick = () => filterByCategory(cat);
        categoryNav.insertBefore(btn, staffCallBtn);
    });

    // Initial render all
    window.allMenuItems = menuItems;
    displayMenuItems(menuItems);
}

function displayMenuItems(items) {
    const menuContainer = document.getElementById('menuContainer');
    menuContainer.innerHTML = '';

    if (items.length === 0) {
        menuContainer.innerHTML = '<div class="menu-loading">해당 카테고리에 메뉴가 없습니다.</div>';
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = `menu-card ${!item.is_available ? 'unavailable' : ''}`;
        
        card.innerHTML = `
            <div class="menu-card-content">
                <h3 class="menu-name">${item.name}</h3>
                <p class="menu-price">${formatPrice(item.price)}</p>
            </div>
            <button class="add-btn" onclick="handleAddToCart(${item.id}, '${item.name}', ${item.price})" ${!item.is_available ? 'disabled' : ''}>
                <i data-lucide="plus"></i> 담기
            </button>
        `;
        menuContainer.appendChild(card);
    });
    
    lucide.createIcons();
}

function filterByCategory(category) {
    // Update active button
    const buttons = document.querySelectorAll('.category-btn');
    buttons.forEach(btn => {
        if (btn.dataset.category === category) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    if (category === 'all') {
        displayMenuItems(window.allMenuItems);
    } else {
        const filtered = window.allMenuItems.filter(item => item.category === category);
        displayMenuItems(filtered);
    }
}

// Cart functions
async function handleAddToCart(id, name, price) {
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id, name, price, quantity: 1 });
    }
    
    updateCartUI();
    
    // Animation effect
    const btn = event.currentTarget;
    const originalHTML = btn.innerHTML;
    btn.classList.add('added');
    btn.innerHTML = '<i data-lucide="check"></i> 완료';
    lucide.createIcons();
    
    setTimeout(() => {
        btn.classList.remove('added');
        btn.innerHTML = originalHTML;
        lucide.createIcons();
    }, 1000);
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = count;
    
    if (count > 0) {
        cartButton.classList.add('has-items');
    } else {
        cartButton.classList.remove('has-items');
    }
}

function openCart() {
    cartModal.classList.add('active');
    renderCartItems();
}

function closeCart() {
    cartModal.classList.remove('active');
}

function renderCartItems() {
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">장바구니가 비어있습니다</p>';
        totalPrice.textContent = '0원';
        return;
    }

    cartItems.innerHTML = '';
    let total = 0;

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="cart-item-info">
                <span class="cart-item-name">${item.name}</span>
                <span class="cart-item-price">${formatPrice(item.price)}</span>
            </div>
            <div class="cart-item-actions">
                <div class="quantity-controls">
                    <button onclick="updateQuantity(${index}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button onclick="updateQuantity(${index}, 1)">+</button>
                </div>
                <button class="remove-item" onclick="removeItem(${index})">&times;</button>
            </div>
        `;
        cartItems.appendChild(div);
    });

    totalPrice.textContent = formatPrice(total);
}

function updateQuantity(index, delta) {
    cart[index].quantity += delta;
    if (cart[index].quantity <= 0) {
        cart.splice(index, 1);
    }
    renderCartItems();
    updateCartUI();
}

function removeItem(index) {
    cart.splice(index, 1);
    renderCartItems();
    updateCartUI();
}

function clearCart() {
    if (cart.length === 0) return;
    if (confirm('장바구니를 비우시겠습니까?')) {
        cart = [];
        renderCartItems();
        updateCartUI();
    }
}

// Place order → server → show prepayment prompt
async function placeOrder() {
    if (cart.length === 0) return;
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const orderId = 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    try {
        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: orderId,
                tableNumber,
                items: cart.map(item => ({...item})),
                total,
                timestamp: new Date().toISOString(),
                sessionToken: sessionStorage.getItem('sessionToken')
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.error || '주문 전송 실패. 다시 시도해주세요.');
            return;
        }
    } catch (e) {
        alert('주문 전송 실패. 다시 시도해주세요.');
        return;
    }

    pendingOrderId = orderId;
    pendingOrderTotal = total;

    closeCart();
    cart = [];
    updateCartUI();
    confirmModal.classList.add('active');
}

// Called when user picks a payment method
async function startPayment(method) {
    if (!pendingOrderId) return;

    const buttons = document.querySelectorAll('.pay-method');
    buttons.forEach(b => b.disabled = true);

    try {
        const cfg = await apiClient.getConfig();
        const tossPayments = TossPayments(cfg.tossClientKey);

        const base = location.origin + location.pathname + `?table=${tableNumber}`;
        await tossPayments.requestPayment(method, {
            amount: pendingOrderTotal,
            orderId: pendingOrderId,
            orderName: `테이블 ${tableNumber} 주문`,
            customerName: `테이블${tableNumber}`,
            successUrl: `${base}&payment=success`,
            failUrl:    `${base}&payment=fail`,
        });
    } catch (err) {
        console.error('payment start error:', err);
        if (err && err.code && err.code !== 'USER_CANCEL') {
            alert(`결제를 시작할 수 없습니다: ${err.message || ''}`);
        }
        buttons.forEach(b => b.disabled = false);
    }
}

// After Toss redirects back, handle the result via URL params
async function handlePaymentReturn() {
    const params = new URLSearchParams(location.search);
    const payment = params.get('payment');
    if (!payment) return;

    // Strip query so refresh doesn't re-run
    const cleanUrl = `${location.origin}${location.pathname}?table=${tableNumber}`;

    if (payment === 'success') {
        const paymentKey = params.get('paymentKey');
        const orderId    = params.get('orderId');
        const amount     = params.get('amount');
        try {
            const r = await apiClient.confirmPayment({ paymentKey, orderId, amount: Number(amount) });
            if (r.success) {
                sessionStorage.removeItem('pendingOrder');
                cart = [];
                updateCartUI();
                if (r.batch) {
                    alert('결제가 완료되었습니다!');
                } else {
                    confirmModal.classList.add('active');
                }
            } else {
                alert('결제 승인 실패');
            }
        } catch (e) {
            console.error(e);
            alert('결제 승인 중 오류가 발생했습니다.');
        }
        history.replaceState(null, '', cleanUrl);
    } else if (payment === 'fail') {
        const msg = params.get('message') || '결제가 취소되었거나 실패했습니다.';
        alert(msg);
        history.replaceState(null, '', cleanUrl);
    }
}

function closeConfirmation() {
    confirmModal.classList.remove('active');
}

function payFromHistory(orderId, total) {
    pendingOrderId = orderId;
    pendingOrderTotal = total;
    historyModal.classList.remove('active');
    document.getElementById('paymentAmount').textContent = total.toLocaleString('ko-KR');
    document.getElementById('paymentMethodModal').classList.add('active');
}
window.payFromHistory = payFromHistory;

async function initSession() {
    const token = sessionStorage.getItem('sessionToken');
    const tokenTable = parseInt(sessionStorage.getItem('sessionTable'));
    if (token && tokenTable === tableNumber) return;
    try {
        const res = await fetch(`/api/tables/${tableNumber}/session`, { method: 'POST' });
        const data = await res.json();
        sessionStorage.setItem('sessionToken', data.sessionToken);
        sessionStorage.setItem('sessionTable', tableNumber);
    } catch (e) {
        console.error('세션 등록 실패', e);
    }
}

// Order History
async function openHistory() {
    historyModal.classList.add('active');
    historyTableNumber.textContent = tableNumber;
    historyItems.innerHTML = '<div class="menu-loading">주문 내역을 불러오는 중...</div>';
    
    try {
        const orders = await apiClient.getOrdersByTable(tableNumber);
        displayOrderHistory(orders);
    } catch (error) {
        console.error('Error loading history:', error);
        historyItems.innerHTML = '<div class="menu-loading">오류가 발생했습니다.</div>';
    }
}

function displayOrderHistory(orders) {
    if (!orders || orders.length === 0) {
        historyItems.innerHTML = '<p class="empty-history">주문 내역이 없습니다</p>';
        return;
    }
    
    historyItems.innerHTML = '';
    
    let totalAmount = 0;
    
    orders.forEach(order => {
        totalAmount += Math.round(parseFloat(order.total));
        
        const orderDiv = document.createElement('div');
        orderDiv.className = 'history-order';
        
        const orderDate = new Date(order.created_at);
        const dateStr = orderDate.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const statusText = {
            'pending': '대기중',
            'cooking': '조리중',
            'completed': '완료',
            'cancelled': '취소됨'
        };
        
        const statusClass = {
            'pending': 'status-pending',
            'cooking': 'status-cooking',
            'completed': 'status-completed',
            'cancelled': 'status-cancelled'
        };
        
        let itemsHTML = '';
        if (order.items && order.items.length > 0) {
            order.items.forEach((item, itemIndex) => {
                const deleteBtn = order.status === 'pending'
                    ? `<button class="delete-item-btn" onclick="deleteOrderItem('${order.id}', ${itemIndex}, '${item.name}')" title="메뉴 취소"><i data-lucide="trash-2"></i></button>`
                    : '';
                itemsHTML += `
                    <div class="history-item">
                        <span class="history-item-name">${item.name}</span>
                        <span class="history-item-detail">${formatPrice(item.price)} × ${item.quantity}</span>
                        ${deleteBtn}
                    </div>
                `;
            });
        }
        
        const paidBadge = order.payment_key
            ? `<span style="color:#22c55e;font-size:12px;">✅ 결제완료</span>` : '';

        orderDiv.innerHTML = `
            <div class="history-order-header">
                <div class="history-order-date">${dateStr}</div>
                <div style="display:flex;gap:6px;align-items:center;">
                    ${paidBadge}
                    <span class="history-status ${statusClass[order.status]}">${statusText[order.status]}</span>
                </div>
            </div>
            <div class="history-order-items">
                ${itemsHTML}
            </div>
            <div class="history-order-total">
                총 금액: <strong>${formatPrice(order.total)}</strong>
            </div>
        `;

        historyItems.appendChild(orderDiv);
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 미결제 합산 결제 버튼
    const unpaidTotal = orders
        .filter(o => !o.payment_key)
        .reduce((sum, o) => sum + Math.round(parseFloat(o.total)), 0);

    if (unpaidTotal > 0) {
        const payAllDiv = document.createElement('div');
        payAllDiv.style.cssText = 'padding:12px 0;';
        payAllDiv.innerHTML = `
            <button class="btn btn-primary" style="width:100%;font-size:16px;padding:14px;"
                onclick="payFromHistory('batch_${tableNumber}_${Date.now()}', ${unpaidTotal})">
                💳 미결제 전체 결제 ${formatPrice(unpaidTotal)}
            </button>`;
        historyItems.appendChild(payAllDiv);
    }

    const calculatorDiv = document.createElement('div');
    calculatorDiv.className = 'split-calculator';
    calculatorDiv.innerHTML = `
        <div class="split-header">
            <h3>💰 N빵 계산기</h3>
        </div>
        <div class="split-total">
            <span>전체 주문 금액:</span>
            <strong>${formatPrice(totalAmount)}</strong>
        </div>
        <div class="split-input">
            <label for="splitCount">인원 수:</label>
            <div class="split-controls">
                <button class="split-btn" onclick="decreaseSplit()">-</button>
                <input type="number" id="splitCount" value="2" min="1" max="20" onchange="calculateSplit()">
                <button class="split-btn" onclick="increaseSplit()">+</button>
            </div>
        </div>
        <div id="splitResult" class="split-result"></div>
    `;

    historyItems.appendChild(calculatorDiv);
    window.historyTotalAmount = totalAmount;
    calculateSplit();
}

function closeHistoryModal() {
    if (historyModal) {
        historyModal.classList.remove('active');
    }
}

function calculateSplit() {
    const splitCount = parseInt(document.getElementById('splitCount').value) || 1;
    const totalAmount = window.historyTotalAmount || 0;
    const resultDiv = document.getElementById('splitResult');
    if (!resultDiv) return;

    if (splitCount === 1) {
        resultDiv.innerHTML = `<div class="split-row"><span>1인당 금액:</span><strong>${formatPrice(totalAmount)}</strong></div>`;
        return;
    }

    // 1,000원 단위로 내림한 1인당 금액
    const base = Math.floor(totalAmount / splitCount / 1000) * 1000;
    // 총무가 부담할 나머지 금액
    const remainder = totalAmount - base * splitCount;

    if (remainder === 0) {
        // 1,000원 단위로 딱 떨어짐
        resultDiv.innerHTML = `<div class="split-row"><span>1인당 금액:</span><strong>${formatPrice(base)}</strong></div>`;
    } else {
        // 총무가 나머지 부담
        const chongmuAmount = base + remainder;
        resultDiv.innerHTML = `
            <div class="split-row">
                <span>💼 총무 금액:</span>
                <strong>${formatPrice(chongmuAmount)}</strong>
            </div>
            <div class="split-row split-others">
                <span>나머지 ${splitCount - 1}명 각각:</span>
                <strong>${formatPrice(base)}</strong>
            </div>
        `;
    }
}

function increaseSplit() {
    const input = document.getElementById('splitCount');
    const currentValue = parseInt(input.value) || 1;
    if (currentValue < 20) {
        input.value = currentValue + 1;
        calculateSplit();
    }
}

function decreaseSplit() {
    const input = document.getElementById('splitCount');
    const currentValue = parseInt(input.value) || 1;
    if (currentValue > 1) {
        input.value = currentValue - 1;
        calculateSplit();
    }
}

async function deleteOrderItem(orderId, itemIndex, itemName) {
    if (!confirm(`"${itemName}" 메뉴를 취소하시겠습니까?`)) {
        return;
    }
    
    try {
        const order = await apiClient.getOrder(orderId);
        if (!order || order.status !== 'pending') {
            alert('대기중인 주문만 취소할 수 있습니다.');
            return;
        }
        
        order.items.splice(itemIndex, 1);
        
        if (order.items.length === 0) {
            await apiClient.deleteOrder(orderId);
            alert('모든 메뉴가 취소되어 주문이 삭제되었습니다.');
        } else {
            const newTotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            await apiClient.deleteOrder(orderId);
            const updatedOrder = {
                id: orderId,
                tableNumber: order.table_number,
                items: order.items,
                total: newTotal,
                timestamp: order.created_at
            };
            await apiClient.createOrder(updatedOrder);
            alert('메뉴가 취소되었습니다.');
        }
        openHistory();
    } catch (error) {
        console.error('Error deleting order item:', error);
        alert('메뉴 취소에 실패했습니다. 다시 시도해주세요.');
    }
}

// Staff call
function openStaffCallModal() {
    if (staffCallModal) {
        staffCallModal.classList.add('active');
    }
}

function closeStaffCallModalFunc() {
    if (staffCallModal) {
        staffCallModal.classList.remove('active');
    }
}

function closeStaffCallConfirmation() {
    if (staffCallConfirmModal) {
        staffCallConfirmModal.classList.remove('active');
    }
}

async function handleStaffCall(e) {
    const message = e.currentTarget.dataset.message;
    if (!message) return;
    sendStaffCall(message);
}

async function sendStaffCall(message) {
    try {
        const callData = {
            tableNumber: tableNumber,
            message: message
        };
        const response = await apiClient.createStaffCall(callData);
        if (response.success) {
            closeStaffCallModalFunc();
            staffCallConfirmModal.classList.add('active');
            setTimeout(() => {
                closeStaffCallConfirmation();
            }, 2000);
        }
    } catch (error) {
        console.error('Error calling staff:', error);
        alert('직원 호출에 실패했습니다. 다시 시도해주세요.');
    }
}

function formatPrice(price) {
    return Math.round(Number(price)).toLocaleString('ko-KR') + '원';
}

// Make functions global
window.calculateSplit = calculateSplit;
window.increaseSplit = increaseSplit;
window.decreaseSplit = decreaseSplit;
window.deleteOrderItem = deleteOrderItem;
window.handleAddToCart = handleAddToCart;
window.updateQuantity = updateQuantity;
window.removeItem = removeItem;
window.filterByCategory = filterByCategory;
