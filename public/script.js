// Cart state
let cart = [];
let tableNumber = getTableNumberFromURL() || Math.floor(Math.random() * 20) + 1;

const CATEGORY_ICONS = {
    '탕수육': '🥘',
    '요리':   '🍲',
    '면':     '🍜',
    '밥':     '🍚',
    '1인세트':'🎁',
    '2인세트':'🎁',
    '계절':   '🌸',
    '주류':   '🍺',
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

    // Real-time updates so an open order-history modal stays consistent with admin changes
    apiClient.connectWebSocket(handleCustomerWebSocketMessage);
});

let historyRefreshPending = false;
function handleCustomerWebSocketMessage(data) {
    // Table cleared = previous customer's session closed by staff. Wipe local state for this table.
    if (data.type === 'table_cleared' && data.tableNumber === tableNumber) {
        cart = [];
        updateCartUI();
        if (historyModal && historyModal.classList.contains('active')) {
            historyItems.innerHTML = '<p class="empty-history">테이블이 마감되었습니다. 새 주문을 시작하세요.</p>';
        }
        return;
    }

    if (!historyModal || !historyModal.classList.contains('active')) return;

    const refreshTriggers = ['order_status_update', 'order_deleted', 'order_updated', 'new_order', 'completed_orders_cleared'];
    if (!refreshTriggers.includes(data.type)) return;

    if (historyRefreshPending) return;
    historyRefreshPending = true;
    setTimeout(() => {
        historyRefreshPending = false;
        if (historyModal.classList.contains('active')) {
            openHistory();
        }
    }, 250);
}

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

async function placeOrder() {
    if (cart.length === 0) return;

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    const orderData = {
        tableNumber: tableNumber,
        items: cart,
        total: total
    };

    try {
        const response = await apiClient.createOrder(orderData);
        if (response.success) {
            cart = [];
            updateCartUI();
            closeCart();
            confirmModal.classList.add('active');
        }
    } catch (error) {
        console.error('Error placing order:', error);
        alert('주문에 실패했습니다. 다시 시도해주세요.');
    }
}

function closeConfirmation() {
    confirmModal.classList.remove('active');
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

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
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
        <div class="split-result">
            <span>1인당 금액:</span>
            <strong id="splitAmount">${formatPrice(Math.ceil(totalAmount / 2))}</strong>
        </div>
    `;
    
    historyItems.appendChild(calculatorDiv);
    window.historyTotalAmount = totalAmount;
}

function closeHistoryModal() {
    if (historyModal) {
        historyModal.classList.remove('active');
    }
}

function calculateSplit() {
    const splitCount = parseInt(document.getElementById('splitCount').value) || 1;
    const totalAmount = window.historyTotalAmount || 0;
    const perPerson = Math.ceil(totalAmount / splitCount);
    document.getElementById('splitAmount').textContent = formatPrice(perPerson);
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
            await apiClient.updateOrderItems(orderId, order.items, newTotal);
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
