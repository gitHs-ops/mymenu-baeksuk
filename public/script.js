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
    if (historyButton) {
        historyButton.addEventListener('click', openHistory);
    }

    // Close history modal
    if (closeHistory) {
        closeHistory.addEventListener('click', closeHistoryModal);
    }

    // Close history modal when clicking outside
    if (historyModal) {
        historyModal.addEventListener('click', (e) => {
            if (e.target === historyModal) {
                closeHistoryModal();
            }
        });
    }

    // Staff call button click
    if (staffCallBtn) {
        staffCallBtn.addEventListener('click', openStaffCallModal);
    }

    // Close staff call modal
    if (closeStaffCall) {
        closeStaffCall.addEventListener('click', closeStaffCallModalFunc);
    }

    // Close staff call confirmation
    if (closeStaffCallConfirm) {
        closeStaffCallConfirm.addEventListener('click', closeStaffCallConfirmation);
    }

    // Staff call options
    const staffCallOptions = document.querySelectorAll('.staff-call-option');
    staffCallOptions.forEach(option => {
        option.addEventListener('click', handleStaffCall);
    });

    // Close modals when clicking outside
    if (staffCallModal) {
        staffCallModal.addEventListener('click', (e) => {
            if (e.target === staffCallModal) {
                closeStaffCallModalFunc();
            }
        });
    }

    if (staffCallConfirmModal) {
        staffCallConfirmModal.addEventListener('click', (e) => {
            if (e.target === staffCallConfirmModal) {
                closeStaffCallConfirmation();
            }
        });
    }

    // Load cart from localStorage
    loadCart();
});

// Load menu from API and render
async function loadMenu() {
    const menuContainer = document.getElementById('menuContainer');
    const categoryNav = document.getElementById('categoryNav');
    try {
        const items = await apiClient.getMenu();
        renderMenu(items, menuContainer, categoryNav);
    } catch (error) {
        console.error('Error loading menu:', error);
        menuContainer.innerHTML = '<div class="menu-loading">메뉴를 불러오는데 실패했습니다</div>';
    }
}

function renderMenu(items, menuContainer, categoryNav) {
    // Group by category (insertion order 유지)
    const categories = {};
    items.forEach(item => {
        if (!item.is_available) return;
        if (!categories[item.category]) categories[item.category] = [];
        categories[item.category].push(item);
    });

    // 카테고리 nav 버튼 동적 생성 (직원호출 버튼 앞에 삽입)
    const staffCallBtn = categoryNav.querySelector('.staff-call-btn');
    categoryNav.querySelectorAll('.category-btn:not([data-category="all"])').forEach(b => b.remove());

    Object.keys(categories).forEach(cat => {
        const icon = CATEGORY_ICONS[cat] || '🍽️';
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.dataset.category = cat;
        btn.textContent = `${icon} ${cat}`;
        categoryNav.insertBefore(btn, staffCallBtn);
    });

    categoryNav.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', handleCategoryClick);
    });

    // 메뉴 섹션 동적 생성
    menuContainer.innerHTML = '';
    Object.entries(categories).forEach(([cat, catItems]) => {
        const icon = CATEGORY_ICONS[cat] || '🍽️';
        const section = document.createElement('section');
        section.className = 'menu-section';
        section.dataset.category = cat;

        const itemsHTML = catItems.map(item => `
            <div class="menu-item" data-name="${item.name}" data-price="${item.price}">
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-price">${Math.round(item.price).toLocaleString('ko-KR')}원</div>
                </div>
                <button class="add-btn">담기</button>
            </div>
        `).join('');

        section.innerHTML = `
            <h2 class="section-title">${icon} ${cat}</h2>
            <div class="menu-grid">${itemsHTML}</div>
        `;
        menuContainer.appendChild(section);
    });

    // 담기 버튼 이벤트 연결
    menuContainer.querySelectorAll('.add-btn').forEach(btn => {
        btn.addEventListener('click', handleAddToCart);
    });
}

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

// Place order - Updated to use API
async function placeOrder() {
    if (cart.length === 0) {
        alert('장바구니가 비어있습니다!');
        return;
    }

    // Disable order button to prevent double submission
    orderButton.disabled = true;
    orderButton.textContent = '주문 중...';

    try {
        // Calculate total
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Create order summary with unique ID
        const orderData = {
            id: 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            tableNumber: tableNumber,
            items: cart.map(item => ({...item})), // Deep copy
            total: total,
            timestamp: new Date().toISOString()
        };

        // Send order to API
        const response = await apiClient.createOrder(orderData);

        if (response.success) {
            // Show confirmation
            closeCart();
            confirmModal.classList.add('active');

            // Clear cart after order
            setTimeout(() => {
                cart = [];
                updateCart();
                saveCart();
            }, 500);
        } else {
            throw new Error('Order creation failed');
        }
    } catch (error) {
        console.error('Error placing order:', error);
        alert('주문 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
        // Re-enable order button
        orderButton.disabled = false;
        orderButton.textContent = '주문하기';
    }
}

// Close confirmation modal
function closeConfirmation() {
    confirmModal.classList.remove('active');
}

// Format price
function formatPrice(price) {
    return Math.round(price).toLocaleString('ko-KR') + '원';
}

// Save cart to localStorage (backup)
function saveCart() {
    localStorage.setItem('restaurantCart', JSON.stringify(cart));
}

// Load cart from localStorage (backup)
function loadCart() {
    const savedCart = localStorage.getItem('restaurantCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCart();
    }
}

// Make functions global for onclick handlers
window.increaseQuantity = increaseQuantity;
window.decreaseQuantity = decreaseQuantity;
window.removeItem = removeItem;

// Made with Bob

// Category filter function
function handleCategoryClick(e) {
    const category = e.currentTarget.dataset.category;
    const sections = document.querySelectorAll('.menu-section');
    const buttons = document.querySelectorAll('.category-btn');

    // Update active button
    buttons.forEach(btn => btn.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    // Show/hide sections
    if (category === 'all') {
        sections.forEach(section => section.classList.remove('hidden'));
    } else {
        sections.forEach(section => {
            if (section.dataset.category === category) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });
    }
    
    // Smooth scroll to menu container
    document.querySelector('.menu-container').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

// Open order history
async function openHistory() {
    if (!historyTableNumber || !historyModal || !historyItems) {
        console.error('History elements not found');
        return;
    }

    historyTableNumber.textContent = tableNumber;
    historyModal.classList.add('active');
    
    // Show loading message
    historyItems.innerHTML = '<p class="empty-history">주문 내역을 불러오는 중...</p>';
    
    try {
        // Fetch orders for this table
        const orders = await apiClient.getOrdersByTable(tableNumber);
        
        // Display orders
        displayOrderHistory(orders);
    } catch (error) {
        console.error('Error fetching order history:', error);
        historyItems.innerHTML = '<p class="empty-history">주문 내역을 불러오는데 실패했습니다</p>';
    }
}

// Display order history
function displayOrderHistory(orders) {
    if (!orders || orders.length === 0) {
        historyItems.innerHTML = '<p class="empty-history">주문 내역이 없습니다</p>';
        return;
    }
    
    historyItems.innerHTML = '';
    
    // Calculate total amount for all orders
    let totalAmount = 0;
    
    orders.forEach(order => {
        totalAmount += Math.round(parseFloat(order.total));
        
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
        
        // Build items list with delete buttons for pending orders
        let itemsHTML = '';
        if (order.items && order.items.length > 0) {
            order.items.forEach((item, itemIndex) => {
                const deleteBtn = order.status === 'pending'
                    ? `<button class="delete-item-btn" onclick="deleteOrderItem('${order.id}', ${itemIndex}, '${item.name}')" title="메뉴 취소">🗑️</button>`
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
    
    // Add N빵 calculator at the bottom
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
    
    // Store total for calculation
    window.historyTotalAmount = totalAmount;
}

// Close history modal
function closeHistoryModal() {
    if (historyModal) {
        historyModal.classList.remove('active');
    }
}

// Split calculator functions
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

// Delete order item function
async function deleteOrderItem(orderId, itemIndex, itemName) {
    if (!confirm(`"${itemName}" 메뉴를 취소하시겠습니까?`)) {
        return;
    }
    
    try {
        // Get the current order
        const order = await apiClient.getOrder(orderId);
        
        if (!order || order.status !== 'pending') {
            alert('대기중인 주문만 취소할 수 있습니다.');
            return;
        }
        
        // Remove the item
        order.items.splice(itemIndex, 1);
        
        // If no items left, delete the entire order
        if (order.items.length === 0) {
            await apiClient.deleteOrder(orderId);
            alert('모든 메뉴가 취소되어 주문이 삭제되었습니다.');
        } else {
            // Recalculate total
            const newTotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            // Update order (delete and recreate with new items)
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
        
        // Refresh order history
        openHistory();
    } catch (error) {
        console.error('Error deleting order item:', error);
        alert('메뉴 취소에 실패했습니다. 다시 시도해주세요.');
    }
}

// Staff call functions
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
    const message = e.target.dataset.message;
    
    if (!message) return;
    
    try {
        const callData = {
            tableNumber: tableNumber,
            message: message
        };
        
        const response = await apiClient.createStaffCall(callData);
        
        if (response.success) {
            closeStaffCallModalFunc();
            staffCallConfirmModal.classList.add('active');
            
            // Auto close confirmation after 2 seconds
            setTimeout(() => {
                closeStaffCallConfirmation();
            }, 2000);
        }
    } catch (error) {
        console.error('Error calling staff:', error);
        alert('직원 호출에 실패했습니다. 다시 시도해주세요.');
    }
}

// Make split functions global
window.calculateSplit = calculateSplit;
window.increaseSplit = increaseSplit;
window.decreaseSplit = decreaseSplit;
window.deleteOrderItem = deleteOrderItem;
