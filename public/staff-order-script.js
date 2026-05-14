// Staff order entry — hall server places orders on behalf of customers

let cart = [];
let selectedTable = null;
let allMenuItems = [];

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

const TABLE_COUNT = 20;

const tableSelect = document.getElementById('tableSelect');
const cartTableNumberSpan = document.getElementById('cartTableNumber');
const confirmTableNumberSpan = document.getElementById('confirmTableNumber');
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

document.addEventListener('DOMContentLoaded', async () => {
    populateTableSelect();
    await loadMenu();

    tableSelect.addEventListener('change', () => {
        const v = parseInt(tableSelect.value, 10);
        selectedTable = isNaN(v) ? null : v;
        const display = selectedTable ?? '-';
        cartTableNumberSpan.textContent = display;
        confirmTableNumberSpan.textContent = display;
    });

    cartButton.addEventListener('click', openCart);
    closeModal.addEventListener('click', closeCart);
    clearCartBtn.addEventListener('click', clearCart);
    orderButton.addEventListener('click', placeOrder);
    closeConfirm.addEventListener('click', () => confirmModal.classList.remove('active'));

    cartModal.addEventListener('click', (e) => {
        if (e.target === cartModal) closeCart();
    });
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) confirmModal.classList.remove('active');
    });
});

function populateTableSelect() {
    for (let i = 1; i <= TABLE_COUNT; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `테이블 ${i}`;
        tableSelect.appendChild(opt);
    }
}

async function loadMenu() {
    try {
        allMenuItems = await apiClient.getMenu();
        renderMenu(allMenuItems);
    } catch (error) {
        console.error('Error loading menu:', error);
        document.getElementById('menuContainer').innerHTML = '<div class="menu-loading">메뉴를 불러오는 중 오류가 발생했습니다.</div>';
    }
}

function renderMenu(menuItems) {
    const categoryNav = document.getElementById('categoryNav');

    const categories = {};
    menuItems.forEach(item => {
        if (!categories[item.category]) categories[item.category] = [];
        categories[item.category].push(item);
    });

    categoryNav.querySelectorAll('.category-btn').forEach(btn => {
        if (btn.dataset.category !== 'all') btn.remove();
    });

    Object.keys(categories).forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.dataset.category = cat;
        btn.innerHTML = `<span class="cat-emoji">${CATEGORY_ICONS[cat] || '🍽️'}</span><span class="cat-text">${cat}</span>`;
        btn.onclick = () => filterByCategory(cat);
        categoryNav.appendChild(btn);
    });

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
            <button class="add-btn" ${!item.is_available ? 'disabled' : ''}>
                <i data-lucide="plus"></i> 담기
            </button>
        `;
        const addBtn = card.querySelector('.add-btn');
        if (item.is_available) {
            addBtn.addEventListener('click', () => handleAddToCart(item.id, item.name, item.price));
        }
        menuContainer.appendChild(card);
    });
    lucide.createIcons();
}

function filterByCategory(category) {
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    const filtered = category === 'all' ? allMenuItems : allMenuItems.filter(i => i.category === category);
    displayMenuItems(filtered);
}

function handleAddToCart(id, name, price) {
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id, name, price, quantity: 1 });
    }
    updateCartUI();
}

function updateCartUI() {
    const totalQty = cart.reduce((sum, i) => sum + i.quantity, 0);
    cartCount.textContent = totalQty;

    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">장바구니가 비어있습니다</p>';
    } else {
        cartItems.innerHTML = '';
        cart.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="cart-item-info">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price">${formatPrice(item.price)}</span>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="decreaseQuantity(${index})">−</button>
                    <span class="qty">${item.quantity}</span>
                    <button class="qty-btn" onclick="increaseQuantity(${index})">＋</button>
                    <button class="remove-btn" onclick="removeItem(${index})">삭제</button>
                </div>
            `;
            cartItems.appendChild(div);
        });
    }

    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    totalPrice.textContent = formatPrice(total);
}

function increaseQuantity(index) {
    cart[index].quantity += 1;
    updateCartUI();
}

function decreaseQuantity(index) {
    if (cart[index].quantity > 1) {
        cart[index].quantity -= 1;
    } else {
        cart.splice(index, 1);
    }
    updateCartUI();
}

function removeItem(index) {
    cart.splice(index, 1);
    updateCartUI();
}

function clearCart() {
    cart = [];
    updateCartUI();
}

function openCart() {
    cartModal.classList.add('active');
}

function closeCart() {
    cartModal.classList.remove('active');
}

async function placeOrder() {
    if (!selectedTable) {
        alert('상단에서 테이블을 먼저 선택하세요.');
        return;
    }
    if (cart.length === 0) {
        alert('장바구니가 비어있습니다.');
        return;
    }

    const total = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    const orderData = {
        tableNumber: selectedTable,
        items: cart,
        total
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
        alert('주문 입력에 실패했습니다. 다시 시도해주세요.');
    }
}

function formatPrice(price) {
    return Math.round(Number(price)).toLocaleString('ko-KR') + '원';
}

window.handleAddToCart = handleAddToCart;
window.increaseQuantity = increaseQuantity;
window.decreaseQuantity = decreaseQuantity;
window.removeItem = removeItem;
window.filterByCategory = filterByCategory;
