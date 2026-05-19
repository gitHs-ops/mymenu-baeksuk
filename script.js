// Cart state
let cart = [];
let tableNumber = getTableNumberFromURL() || Math.floor(Math.random() * 20) + 1;
let pendingOrderId = null;
let pendingOrderTotal = 0;

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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Display table number
    tableNumberSpan.textContent = tableNumber;

    // Add event listeners to all "Add" buttons
    const addButtons = document.querySelectorAll('.add-btn');
    addButtons.forEach(button => {
        button.addEventListener('click', handleAddToCart);
    });

    // Cart button click
    cartButton.addEventListener('click', openCart);

    // Close modal
    closeModal.addEventListener('click', closeCart);

    // Clear cart
    clearCartBtn.addEventListener('click', clearCart);

    // Order button
    orderButton.addEventListener('click', placeOrder);

    // Close payment method modal
    document.getElementById('closePaymentMethod').addEventListener('click', closePaymentMethodModal);
    document.getElementById('paymentMethodModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('paymentMethodModal')) closePaymentMethodModal();
    });

    // Payment method buttons
    document.querySelectorAll('.pay-method').forEach(btn => {
        btn.addEventListener('click', () => startPayment(btn.dataset.method));
    });

    // Close confirmation (나중에)
    closeConfirm.addEventListener('click', closeConfirmation);

    // 결제하기 버튼 → 결제수단 모달
    document.getElementById('gotoPaymentBtn').addEventListener('click', () => {
        closeConfirmation();
        openPaymentMethodModal();
    });

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

    // Close history modal
    closeHistory.addEventListener('click', closeHistoryModal);

    // Close history modal when clicking outside
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) {
            closeHistoryModal();
        }
    });

    // Load cart from localStorage
    loadCart();

    // Register table session (prevents ordering after table is cleared)
    initSession();
});

// Add item to cart
function handleAddToCart(e) {
    const menuItem = e.target.closest('.menu-item');
    const name = menuItem.dataset.name;
    const price = parseInt(menuItem.dataset.price);

    // Check if item already exists in cart
    const existingItem = cart.find(item => item.name === name);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            name: name,
            price: price,
            quantity: 1
        });
    }

    // Add animation to button
    e.target.textContent = '✓ 담김';
    e.target.style.background = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
    
    setTimeout(() => {
        e.target.textContent = '담기';
        e.target.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }, 500);

    updateCart();
    saveCart();
}

// Update cart display
function updateCart() {
    // Update cart count
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;

    // Update cart items display
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

        const cartItemDiv = document.createElement('div');
        cartItemDiv.className = 'cart-item';
        cartItemDiv.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${formatPrice(item.price)} × ${item.quantity} = ${formatPrice(itemTotal)}</div>
            </div>
            <div class="cart-item-controls">
                <button class="quantity-btn" onclick="decreaseQuantity(${index})">-</button>
                <span class="quantity">${item.quantity}</span>
                <button class="quantity-btn" onclick="increaseQuantity(${index})">+</button>
                <button class="remove-btn" onclick="removeItem(${index})">삭제</button>
            </div>
        `;
        cartItems.appendChild(cartItemDiv);
    });

    totalPrice.textContent = formatPrice(total);
}

// Increase quantity
function increaseQuantity(index) {
    cart[index].quantity++;
    updateCart();
    saveCart();
}

// Decrease quantity
function decreaseQuantity(index) {
    if (cart[index].quantity > 1) {
        cart[index].quantity--;
    } else {
        cart.splice(index, 1);
    }
    updateCart();
    saveCart();
}

// Remove item
function removeItem(index) {
    cart.splice(index, 1);
    updateCart();
    saveCart();
}

// Clear cart
function clearCart() {
    if (cart.length === 0) return;
    
    if (confirm('장바구니를 비우시겠습니까?')) {
        cart = [];
        updateCart();
        saveCart();
    }
}

// Open cart modal
function openCart() {
    cartModal.classList.add('active');
    updateCart();
}

// Close cart modal
function closeCart() {
    cartModal.classList.remove('active');
}

// Register session on page load
async function initSession() {
    let token = sessionStorage.getItem('sessionToken');
    let tokenTable = parseInt(sessionStorage.getItem('sessionTable'));
    if (token && tokenTable === tableNumber) return; // 이미 등록된 세션

    try {
        const res = await fetch(`/api/tables/${tableNumber}/session`, { method: 'POST' });
        const data = await res.json();
        sessionStorage.setItem('sessionToken', data.sessionToken);
        sessionStorage.setItem('sessionTable', tableNumber);
    } catch (e) {
        console.error('세션 등록 실패', e);
    }
}

// Place order (directly to server, then ask for prepayment)
async function placeOrder() {
    if (cart.length === 0) {
        alert('장바구니가 비어있습니다!');
        return;
    }

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

    // 결제용으로 orderId/total 보관
    pendingOrderId = orderId;
    pendingOrderTotal = total;

    closeCart();
    confirmModal.classList.add('active');

    setTimeout(() => {
        cart = [];
        updateCart();
        saveCart();
    }, 500);
}

function openPaymentMethodModal() {
    document.getElementById('paymentAmount').textContent = pendingOrderTotal.toLocaleString('ko-KR');
    document.getElementById('paymentMethodModal').classList.add('active');
}

function closePaymentMethodModal() {
    document.getElementById('paymentMethodModal').classList.remove('active');
}

async function startPayment(method) {
    if (!pendingOrderId) return;

    const { tossClientKey } = await (await fetch('/api/config')).json();
    const tossPayments = TossPayments(tossClientKey);
    tossPayments.requestPayment(method, {
        amount: pendingOrderTotal,
        orderId: pendingOrderId,
        orderName: `테이블 ${tableNumber} 주문`,
        customerName: `테이블 ${tableNumber}`,
        successUrl: window.location.origin + '/payment-success.html',
        failUrl: window.location.origin + '/payment-fail.html'
    });
}

// Close confirmation modal
function closeConfirmation() {
    confirmModal.classList.remove('active');
}

// Format price
function formatPrice(price) {
    return price.toLocaleString('ko-KR') + '원';
}

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('restaurantCart', JSON.stringify(cart));
}

// Load cart from localStorage
function loadCart() {
    const savedCart = localStorage.getItem('restaurantCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCart();
    }
}

// Open order history
async function openHistory() {
    historyTableNumber.textContent = tableNumber;
    historyModal.classList.add('active');
    
    // Show loading message
    historyItems.innerHTML = '<p class="empty-history">주문 내역을 불러오는 중...</p>';
    
    try {
        // Fetch orders for this table
        const response = await fetch(`/api/orders/table/${tableNumber}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch order history');
        }
        
        const orders = await response.json();
        
        // Display orders
        displayOrderHistory(orders);
    } catch (error) {
        console.error('Error fetching order history:', error);
        historyItems.innerHTML = '<p class="empty-history">주문 내역을 불러오는데 실패했습니다</p>';
    }
}

// Display order history
function displayOrderHistory(orders) {
    if (orders.length === 0) {
        historyItems.innerHTML = '<p class="empty-history">주문 내역이 없습니다</p>';
        return;
    }
    
    historyItems.innerHTML = '';
    
    orders.forEach(order => {
        const orderDiv = document.createElement('div');
        orderDiv.className = 'history-order';
        
        // Format date
        const orderDate = new Date(order.created_at);
        const dateStr = orderDate.toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Status badge
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
        
        // Build items list
        let itemsHTML = '';
        order.items.forEach(item => {
            itemsHTML += `
                <div class="history-item">
                    <span class="history-item-name">${item.name}</span>
                    <span class="history-item-detail">${formatPrice(item.price)} × ${item.quantity}</span>
                </div>
            `;
        });
        
        orderDiv.innerHTML = `
            <div class="history-order-header">
                <div class="history-order-date">${dateStr}</div>
                <span class="history-status ${statusClass[order.status]}">${statusText[order.status]}</span>
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
}

// Close history modal
function closeHistoryModal() {
    historyModal.classList.remove('active');
}

// Make functions global for onclick handlers
window.increaseQuantity = increaseQuantity;
window.decreaseQuantity = decreaseQuantity;
window.removeItem = removeItem;

// Made with Bob
