let menuItems = [];

const menuListEl = document.getElementById('menuList');
const menuTotalCountEl = document.getElementById('menuTotalCount');
const addMenuForm = document.getElementById('addMenuForm');
const categoryListEl = document.getElementById('categoryList');
const editModal = document.getElementById('editModal');

const CATEGORY_ICONS = {
    '탕수육': '🥘', '요리': '🍲', '면': '🍜', '밥': '🍚',
    '1인세트': '🎁', '2인세트': '🎁', '계절': '🌸', '주류': '🍺',
};

document.addEventListener('DOMContentLoaded', async () => {
    await loadMenu();

    addMenuForm.addEventListener('submit', handleAdd);

    document.getElementById('closeEditModal').addEventListener('click', closeEdit);
    document.getElementById('closeEditModal2').addEventListener('click', closeEdit);
    document.getElementById('saveEditBtn').addEventListener('click', handleSaveEdit);
    editModal.addEventListener('click', e => { if (e.target === editModal) closeEdit(); });
});

async function loadMenu() {
    try {
        menuItems = await apiClient.getMenu();
        renderMenuList();
    } catch (e) {
        menuListEl.innerHTML = '<div class="menu-loading">메뉴를 불러오는데 실패했습니다</div>';
    }
}

function renderMenuList() {
    menuTotalCountEl.textContent = `${menuItems.length}개`;

    // 카테고리 datalist 업데이트
    const cats = [...new Set(menuItems.map(i => i.category))];
    categoryListEl.innerHTML = cats.map(c => `<option value="${c}">`).join('');

    if (menuItems.length === 0) {
        menuListEl.innerHTML = '<div class="menu-loading">등록된 메뉴가 없습니다</div>';
        return;
    }

    // 카테고리별 그룹화
    const groups = {};
    menuItems.forEach(item => {
        if (!groups[item.category]) groups[item.category] = [];
        groups[item.category].push(item);
    });

    menuListEl.innerHTML = '';
    Object.entries(groups).forEach(([cat, items]) => {
        const icon = CATEGORY_ICONS[cat] || '🍽️';
        const group = document.createElement('div');
        group.className = 'menu-category-group';
        group.innerHTML = `
            <div class="menu-category-title">
                ${icon} ${cat}
                <span class="category-item-count">${items.length}개</span>
            </div>
        `;
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = `menu-row${item.is_available ? '' : ' row-unavailable'}`;
            row.dataset.id = item.id;
            row.innerHTML = `
                <span class="menu-row-name">${item.name}</span>
                <span class="menu-row-price">${Number(item.price).toLocaleString('ko-KR')}원</span>
                <div class="menu-row-actions">
                    <label class="availability-toggle" title="${item.is_available ? '판매중' : '판매중지'}">
                        <input type="checkbox" ${item.is_available ? 'checked' : ''}
                            onchange="toggleAvailability(${item.id}, this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="btn-row-edit" onclick="openEdit(${item.id})">수정</button>
                    <button class="btn-row-delete" onclick="handleDelete(${item.id})">🗑️</button>
                </div>
            `;
            group.appendChild(row);
        });
        menuListEl.appendChild(group);
    });
}

// 추가
async function handleAdd(e) {
    e.preventDefault();
    const name     = document.getElementById('newName').value.trim();
    const category = document.getElementById('newCategory').value.trim();
    const price    = parseInt(document.getElementById('newPrice').value);

    if (!name || !category || isNaN(price)) return;

    try {
        await apiClient.addMenuItem({ name, category, price });
        addMenuForm.reset();
        await loadMenu();
    } catch (err) {
        alert('추가에 실패했습니다.');
    }
}

// 수정 모달 열기
function openEdit(id) {
    const item = menuItems.find(i => i.id === id);
    if (!item) return;
    document.getElementById('editId').value = id;
    document.getElementById('editName').value = item.name;
    document.getElementById('editCategory').value = item.category;
    document.getElementById('editPrice').value = item.price;
    editModal.classList.add('active');
}

function closeEdit() {
    editModal.classList.remove('active');
}

async function handleSaveEdit() {
    const id       = parseInt(document.getElementById('editId').value);
    const name     = document.getElementById('editName').value.trim();
    const category = document.getElementById('editCategory').value.trim();
    const price    = parseInt(document.getElementById('editPrice').value);

    if (!name || !category || isNaN(price)) return;

    try {
        await apiClient.updateMenuItem(id, { name, category, price });
        closeEdit();
        await loadMenu();
    } catch (err) {
        alert('수정에 실패했습니다.');
    }
}

// 삭제
async function handleDelete(id) {
    const item = menuItems.find(i => i.id === id);
    if (!confirm(`"${item?.name}" 메뉴를 삭제하시겠습니까?`)) return;
    try {
        await apiClient.deleteMenuItem(id);
        await loadMenu();
    } catch (err) {
        alert('삭제에 실패했습니다.');
    }
}

// 판매 여부 토글
async function toggleAvailability(id, available) {
    try {
        await apiClient.toggleMenuAvailability(id, available);
        const item = menuItems.find(i => i.id === id);
        if (item) item.is_available = available;
        // 행 스타일만 즉시 업데이트
        const row = document.querySelector(`.menu-row[data-id="${id}"]`);
        if (row) row.classList.toggle('row-unavailable', !available);
    } catch (err) {
        alert('상태 변경에 실패했습니다.');
        await loadMenu(); // 롤백
    }
}

window.openEdit = openEdit;
window.handleDelete = handleDelete;
window.toggleAvailability = toggleAvailability;
