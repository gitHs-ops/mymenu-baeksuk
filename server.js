const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
require('dotenv').config();

// Only require database if DB credentials are provided
// Support both custom env vars and Railway's default MySQL vars
let pool, testConnection, initializeDatabase;
let USE_DATABASE = (process.env.DB_HOST || process.env.MYSQLHOST) &&
                     (process.env.DB_USER || process.env.MYSQLUSER);

// In-memory storage for development without database
let memoryOrders = [];
let staffCalls = [];

// Session store: token → { tableNumber, createdAt }
const sessionStore = new Map();
// Last cleared timestamp per table (kept in memory regardless of DB mode)
const tableLastCleared = new Map();

const memoryMenu = [
    { id:  1, name: '토종닭 백숙',                                           category: '메인메뉴', price:  65000, is_available: true, sort_order:  1 },
    { id:  2, name: '오리 백숙',                                             category: '메인메뉴', price:  70000, is_available: true, sort_order:  2 },
    { id:  3, name: '토종옻닭 백숙',                                         category: '메인메뉴', price:  70000, is_available: true, sort_order:  3 },
    { id:  4, name: '오리옻 백숙',                                           category: '메인메뉴', price:  75000, is_available: true, sort_order:  4 },
    { id:  5, name: '들깨·녹두 닭백숙',                                      category: '메인메뉴', price:  70000, is_available: true, sort_order:  5 },
    { id:  6, name: '들깨·녹두 오리백숙',                                    category: '메인메뉴', price:  75000, is_available: true, sort_order:  6 },
    { id:  7, name: '오리불고기',                                            category: '메인메뉴', price:  45000, is_available: true, sort_order:  7 },
    { id:  8, name: '볶음밥',                                                category: '메인메뉴', price:   2000, is_available: true, sort_order:  8 },
    { id:  9, name: '장수탕 닭 또는 오리 (문어·우렁·홍합·왕쭈꾸미·전복·가리비)', category: '특선',     price: 130000, is_available: true, sort_order: 10 },
    { id: 10, name: '왕새우 4마리',                                          category: '추가메뉴', price:  15000, is_available: true, sort_order: 20 },
    { id: 11, name: '왕홍합 10마리',                                         category: '추가메뉴', price:  10000, is_available: true, sort_order: 21 },
    { id: 12, name: '왕쭈꾸미 1마리',                                        category: '추가메뉴', price:  10000, is_available: true, sort_order: 22 },
    { id: 13, name: '전복 4마리',                                            category: '추가메뉴', price:  15000, is_available: true, sort_order: 23 },
    { id: 14, name: '가리비 4마리',                                          category: '추가메뉴', price:  15000, is_available: true, sort_order: 24 },
    { id: 15, name: '죽 포장',                                               category: '추가메뉴', price:  10000, is_available: true, sort_order: 25 },
    { id: 16, name: '도토리묵무침',                                          category: '사이드',   price:  12000, is_available: true, sort_order: 30 },
    { id: 17, name: '소주',                                                  category: '주류',     price:   4000, is_available: true, sort_order: 40 },
    { id: 18, name: '맥주',                                                  category: '주류',     price:   4000, is_available: true, sort_order: 41 },
    { id: 19, name: '막걸리',                                                category: '주류',     price:   4000, is_available: true, sort_order: 42 },
    { id: 20, name: '음료수',                                                category: '주류',     price:   2000, is_available: true, sort_order: 43 },
];

if (USE_DATABASE) {
    const db = require('./database/db');
    pool = db.pool;
    testConnection = db.testConnection;
    initializeDatabase = db.initializeDatabase;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Serve static files
app.use(express.static('.', {
    index: false,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    clients.add(ws);

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// Broadcast to all connected clients
function broadcast(data) {
    const message = JSON.stringify(data);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Get menu items
// ?all=true → 관리자용 전체 반환, 기본은 판매중 항목만
app.get('/api/menu', async (req, res) => {
    const showAll = req.query.all === 'true';
    if (!USE_DATABASE) {
        return res.json(showAll ? memoryMenu : memoryMenu.filter(i => i.is_available));
    }
    try {
        const query = showAll
            ? 'SELECT id, name, category, price, is_available, sort_order FROM menu_items ORDER BY sort_order ASC'
            : 'SELECT id, name, category, price, is_available, sort_order FROM menu_items WHERE is_available = TRUE ORDER BY sort_order ASC';
        const [items] = await pool.query(query);
        res.json(items);
    } catch (error) {
        console.error('Error fetching menu:', error);
        res.status(500).json({ error: 'Failed to fetch menu', details: error.message });
    }
});

// Add menu item
app.post('/api/menu', async (req, res) => {
    const { name, category, price } = req.body;
    if (!name || !category || price === undefined) {
        return res.status(400).json({ error: 'name, category, price required' });
    }
    if (!USE_DATABASE) {
        const newId = Math.max(0, ...memoryMenu.map(i => i.id)) + 1;
        const sortOrder = newId * 10;
        const item = { id: newId, name, category, price: parseFloat(price), is_available: true, sort_order: sortOrder };
        memoryMenu.push(item);
        return res.status(201).json(item);
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO menu_items (name, category, price) VALUES (?, ?, ?)',
            [name, category, parseFloat(price)]
        );
        const [rows] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
        res.status(201).json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add menu item', details: error.message });
    }
});

// Update menu item
app.put('/api/menu/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, category, price } = req.body;
    if (!USE_DATABASE) {
        const item = memoryMenu.find(i => i.id === id);
        if (!item) return res.status(404).json({ error: 'Not found' });
        if (name !== undefined) item.name = name;
        if (category !== undefined) item.category = category;
        if (price !== undefined) item.price = parseFloat(price);
        return res.json(item);
    }
    try {
        await pool.query(
            'UPDATE menu_items SET name=?, category=?, price=? WHERE id=?',
            [name, category, parseFloat(price), id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update menu item', details: error.message });
    }
});

// Toggle menu availability
app.patch('/api/menu/:id/availability', async (req, res) => {
    const id = parseInt(req.params.id);
    const { is_available } = req.body;
    if (!USE_DATABASE) {
        const item = memoryMenu.find(i => i.id === id);
        if (!item) return res.status(404).json({ error: 'Not found' });
        item.is_available = Boolean(is_available);
        return res.json(item);
    }
    try {
        await pool.query('UPDATE menu_items SET is_available=? WHERE id=?', [is_available ? 1 : 0, id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update availability', details: error.message });
    }
});

// Delete menu item
app.delete('/api/menu/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (!USE_DATABASE) {
        const idx = memoryMenu.findIndex(i => i.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        memoryMenu.splice(idx, 1);
        return res.json({ success: true });
    }
    try {
        await pool.query('DELETE FROM menu_items WHERE id=?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete menu item', details: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public config (client key for Toss Payments)
// Falls back to Toss's public docs test key when env var is missing.
app.get('/api/config', (req, res) => {
    res.json({
        tossClientKey: process.env.TOSS_CLIENT_KEY || 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm'
    });
});

// Payment: confirm payment with Toss after successUrl redirect
app.post('/api/payment/confirm', async (req, res) => {
    const { paymentKey, orderId, amount } = req.body;
    if (!paymentKey || !orderId || amount == null) {
        return res.status(400).json({ error: 'paymentKey, orderId, amount are required' });
    }

    const secretKey = process.env.TOSS_SECRET_KEY || 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6';

    // ── 배치 결제: orderId = "batch_{tableNumber}_{timestamp}" ──
    if (orderId.startsWith('batch_')) {
        const tableNumber = parseInt(orderId.split('_')[1], 10);

        // Toss confirm
        let tossData;
        try {
            const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
                method: 'POST',
                headers: {
                    Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ paymentKey, orderId, amount })
            });
            tossData = await resp.json();
            if (!resp.ok) {
                console.error('Toss batch confirm failed:', tossData);
                return res.status(400).json({ error: 'payment confirm failed', details: tossData });
            }
        } catch (err) {
            return res.status(502).json({ error: 'failed to reach Toss', details: err.message });
        }

        const paidAt = new Date();
        const method = tossData.method || null;

        // 해당 테이블의 미결제 주문 전체 paid 처리
        if (USE_DATABASE) {
            await pool.query(
                "UPDATE orders SET payment_status='paid', payment_key=?, payment_method=?, paid_at=? WHERE table_number=? AND (payment_key IS NULL OR payment_key='') AND cleared_at IS NULL",
                [paymentKey, method, paidAt, tableNumber]
            );
        } else {
            memoryOrders.forEach(o => {
                if (o.table_number === tableNumber && !o.payment_key && !o.cleared_at) {
                    o.payment_status = 'paid';
                    o.payment_key = paymentKey;
                    o.payment_method = method;
                    o.paid_at = paidAt.toISOString();
                }
            });
        }

        return res.json({ success: true, batch: true });
    }

    // ── 단건 결제 ──
    let storedOrder = null;
    if (USE_DATABASE) {
        const [[row]] = await pool.query(
            'SELECT id, table_number, total, payment_status, payment_key FROM orders WHERE id = ?', [orderId]
        );
        storedOrder = row;
    } else {
        storedOrder = memoryOrders.find(o => o.id === orderId) || null;
    }
    if (!storedOrder) {
        return res.status(404).json({ error: 'order not found' });
    }
    if (Number(storedOrder.total) !== Number(amount)) {
        return res.status(400).json({ error: 'amount mismatch' });
    }
    if (storedOrder.payment_status === 'paid' && storedOrder.payment_key) {
        return res.json({ success: true, alreadyPaid: true });
    }

    // Toss confirm
    let tossData;
    try {
        const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
            method: 'POST',
            headers: {
                Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paymentKey, orderId, amount })
        });
        tossData = await resp.json();
        if (!resp.ok) {
            console.error('Toss confirm failed:', tossData);
            if (USE_DATABASE) {
                await pool.query("UPDATE orders SET payment_status='failed' WHERE id=?", [orderId]);
            } else {
                storedOrder.payment_status = 'failed';
            }
            return res.status(400).json({ error: 'payment confirm failed', details: tossData });
        }
    } catch (err) {
        console.error('Toss API error:', err);
        return res.status(502).json({ error: 'failed to reach Toss', details: err.message });
    }

    const paidAt = new Date();
    const method = tossData.method || null;
    if (USE_DATABASE) {
        await pool.query(
            "UPDATE orders SET payment_status='paid', payment_key=?, payment_method=?, paid_at=? WHERE id=?",
            [paymentKey, method, paidAt, orderId]
        );
    } else {
        storedOrder.payment_status = 'paid';
        storedOrder.payment_key = paymentKey;
        storedOrder.payment_method = method;
        storedOrder.paid_at = paidAt.toISOString();
    }

    let fullOrder;
    if (USE_DATABASE) {
        const [[row]] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        const [items] = await pool.query(
            'SELECT item_name as name, price, quantity FROM order_items WHERE order_id = ?',
            [orderId]
        );
        fullOrder = { ...row, items };
    } else {
        fullOrder = storedOrder;
    }
    broadcast({ type: 'new_order', order: fullOrder });

    res.json({ success: true, order: fullOrder });
});

// Get all orders
app.get('/api/orders', async (req, res) => {
    // Compute KST [start, end) UTC range for a YYYY-MM-DD KST date
    const kstRange = (date) => {
        const [y, m, d] = date.split('-').map(Number);
        const startMs = Date.UTC(y, m - 1, d) - 9 * 3600 * 1000;
        return { startMs, endMs: startMs + 24 * 3600 * 1000 };
    };

    if (!USE_DATABASE) {
        // Use in-memory storage
        const { status, date } = req.query;
        let filteredOrders = memoryOrders;

        if (date) {
            const { startMs, endMs } = kstRange(date);
            filteredOrders = filteredOrders.filter(o => {
                const t = new Date(o.created_at).getTime();
                return t >= startMs && t < endMs;
            });
        }

        if (status && status !== 'all') {
            filteredOrders = filteredOrders.filter(o => o.status === status);
        }

        return res.json(filteredOrders);
    }

    try {
        const { status, date } = req.query;

        // Get orders
        let orderQuery = 'SELECT * FROM orders';
        let orderParams = [];
        const conditions = [];

        if (date) {
            // Compare in KST: created_at (UTC) shifted +9h, then take DATE
            conditions.push("DATE(CONVERT_TZ(created_at, '+00:00', '+09:00')) = ?");
            orderParams.push(date);
        }

        if (status && status !== 'all') {
            conditions.push('status = ?');
            orderParams.push(status);
        }

        if (conditions.length > 0) {
            orderQuery += ' WHERE ' + conditions.join(' AND ');
        }

        orderQuery += ' ORDER BY created_at DESC';
        
        const [orders] = await pool.query(orderQuery, orderParams);
        
        // Get items for each order
        for (const order of orders) {
            const [items] = await pool.query(
                'SELECT item_name as name, price, quantity FROM order_items WHERE order_id = ?',
                [order.id]
            );
            order.items = items;
        }
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        console.error('Error details:', error.message);
        res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
    }
});

// Get orders by table number (only un-cleared = current session)
app.get('/api/orders/table/:tableNumber', async (req, res) => {
    const { tableNumber } = req.params;

    if (!USE_DATABASE) {
        // Use in-memory storage
        const tableOrders = memoryOrders.filter(o =>
            o.table_number === parseInt(tableNumber) && !o.cleared_at
        );
        return res.json(tableOrders);
    }

    try {
        // Get orders for specific table — exclude cleared sessions
        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE table_number = ? AND cleared_at IS NULL ORDER BY created_at DESC',
            [tableNumber]
        );
        
        // Get items for each order
        for (const order of orders) {
            const [items] = await pool.query(
                'SELECT item_name as name, price, quantity FROM order_items WHERE order_id = ?',
                [order.id]
            );
            order.items = items;
        }
        
        res.json(orders);
    } catch (error) {
        console.error('Error fetching table orders:', error);
        res.status(500).json({ error: 'Failed to fetch table orders', details: error.message });
    }
});

// Get single order
app.get('/api/orders/:id', async (req, res) => {
    if (!USE_DATABASE) {
        // Use in-memory storage
        const order = memoryOrders.find(o => o.id === req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        return res.json(order);
    }
    
    try {
        const { id } = req.params;
        
        // Get order
        const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [id]);
        
        if (orders.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        const order = orders[0];
        
        // Get items
        const [items] = await pool.query(
            'SELECT item_name as name, price, quantity FROM order_items WHERE order_id = ?',
            [id]
        );
        order.items = items;
        
        res.json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order', details: error.message });
    }
});

// Create new order
// When `paymentMethod` is provided, the order is created in payment_status='pending'
// and NOT broadcast to admin yet. Broadcast happens after /api/payment/confirm.
// Legacy callers (no paymentMethod) keep the old behavior: paid + broadcast.
app.post('/api/orders', async (req, res) => {
    const { id: clientId, tableNumber, items, total, timestamp, paymentMethod, sessionToken } = req.body;

    // Validate session
    const session = sessionToken ? sessionStore.get(sessionToken) : null;
    if (!session || session.tableNumber !== tableNumber) {
        return res.status(403).json({ error: '유효하지 않은 세션입니다. 페이지를 새로 고침하세요.' });
    }
    const lastCleared = tableLastCleared.get(tableNumber);
    if (lastCleared && new Date(session.createdAt) < new Date(lastCleared)) {
        return res.status(403).json({ error: '테이블이 마감되었습니다. 직원을 호출해 주세요.' });
    }

    const id = clientId || ('order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    const isPrepay = !!paymentMethod;
    const paymentStatus = isPrepay ? 'pending' : 'paid';

    if (!USE_DATABASE) {
        // Use in-memory storage
        const newOrder = {
            id,
            table_number: tableNumber,
            items,
            total,
            status: 'pending',
            payment_status: paymentStatus,
            payment_method: paymentMethod || null,
            created_at: timestamp || new Date().toISOString()
        };

        memoryOrders.unshift(newOrder);

        // Only broadcast if already paid (legacy flow)
        if (!isPrepay) {
            broadcast({ type: 'new_order', order: newOrder });
        }

        return res.status(201).json({ success: true, orderId: id, amount: total });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Convert ISO string to MySQL datetime format
        const createdAt = timestamp ? new Date(timestamp) : new Date();

        // Insert order
        await connection.query(
            'INSERT INTO orders (id, table_number, total, status, payment_status, payment_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, tableNumber, total, 'pending', paymentStatus, paymentMethod || null, createdAt]
        );

        // Insert order items
        for (const item of items) {
            await connection.query(
                'INSERT INTO order_items (order_id, item_name, price, quantity) VALUES (?, ?, ?, ?)',
                [id, item.name, item.price, item.quantity]
            );
        }

        await connection.commit();

        // Only broadcast if already paid (legacy flow)
        if (!isPrepay) {
            broadcast({
                type: 'new_order',
                order: {
                    id,
                    table_number: tableNumber,
                    items,
                    total,
                    status: 'pending',
                    payment_status: 'paid',
                    created_at: createdAt.toISOString()
                }
            });
        }

        res.status(201).json({ success: true, orderId: id, amount: total });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    } finally {
        connection.release();
    }
});

// Update order status
app.patch('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!USE_DATABASE) {
        // Use in-memory storage
        const order = memoryOrders.find(o => o.id === id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        order.status = status;
        if (status === 'completed') {
            order.completed_at = new Date().toISOString();
        }
        
        // Broadcast status update
        broadcast({
            type: 'order_status_update',
            orderId: id,
            status,
            completedAt: order.completed_at
        });
        
        return res.json({ success: true });
    }
    
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['pending', 'cooking', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const completedAt = status === 'completed' ? new Date() : null;
        
        await pool.query(
            'UPDATE orders SET status = ?, completed_at = ? WHERE id = ?',
            [status, completedAt, id]
        );
        
        // Broadcast status update
        broadcast({
            type: 'order_status_update',
            orderId: id,
            status,
            completedAt
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// Replace order items (partial cancel from customer side)
app.patch('/api/orders/:id/items', async (req, res) => {
    const { id } = req.params;
    const { items, total } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items must be a non-empty array' });
    }

    if (!USE_DATABASE) {
        const order = memoryOrders.find(o => o.id === id);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.status !== 'pending') {
            return res.status(409).json({ error: 'Only pending orders can be modified' });
        }
        order.items = items;
        order.total = total;

        broadcast({
            type: 'order_updated',
            orderId: id,
            items,
            total
        });
        return res.json({ success: true });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query('SELECT status FROM orders WHERE id = ? FOR UPDATE', [id]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Order not found' });
        }
        if (rows[0].status !== 'pending') {
            await connection.rollback();
            return res.status(409).json({ error: 'Only pending orders can be modified' });
        }

        await connection.query('DELETE FROM order_items WHERE order_id = ?', [id]);
        for (const item of items) {
            await connection.query(
                'INSERT INTO order_items (order_id, item_name, price, quantity) VALUES (?, ?, ?, ?)',
                [id, item.name, item.price, item.quantity]
            );
        }
        await connection.query('UPDATE orders SET total = ? WHERE id = ?', [total, id]);

        await connection.commit();

        broadcast({
            type: 'order_updated',
            orderId: id,
            items,
            total
        });

        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating order items:', error);
        res.status(500).json({ error: 'Failed to update order items' });
    } finally {
        connection.release();
    }
});

// Delete order
app.delete('/api/orders/:id', async (req, res) => {
    const { id } = req.params;
    
    if (!USE_DATABASE) {
        // Use in-memory storage
        const index = memoryOrders.findIndex(o => o.id === id);
        if (index === -1) {
            return res.status(404).json({ error: 'Order not found' });
        }
        
        memoryOrders.splice(index, 1);
        
        // Broadcast deletion
        broadcast({
            type: 'order_deleted',
            orderId: id
        });
        
        return res.json({ success: true });
    }
    
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM orders WHERE id = ?', [id]);
        
        // Broadcast deletion
        broadcast({
            type: 'order_deleted',
            orderId: id
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

// Register a new customer session for a table
app.post('/api/tables/:tableNumber/session', (req, res) => {
    const tableNumber = parseInt(req.params.tableNumber, 10);
    if (isNaN(tableNumber)) return res.status(400).json({ error: 'Invalid table number' });

    const token = Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
    const createdAt = new Date().toISOString();
    sessionStore.set(token, { tableNumber, createdAt });
    res.json({ sessionToken: token, createdAt });
});

// Clear (close) a table's session — keeps rows for stats but hides from customer history
app.post('/api/tables/:tableNumber/clear', async (req, res) => {
    const tableNumber = parseInt(req.params.tableNumber, 10);
    if (isNaN(tableNumber)) {
        return res.status(400).json({ error: 'Invalid table number' });
    }

    const clearedAt = new Date().toISOString();
    tableLastCleared.set(tableNumber, clearedAt);

    if (!USE_DATABASE) {
        let count = 0;
        memoryOrders.forEach(o => {
            if (o.table_number === tableNumber && !o.cleared_at) {
                o.cleared_at = clearedAt;
                count++;
            }
        });
        broadcast({ type: 'table_cleared', tableNumber, clearedCount: count });
        return res.json({ success: true, clearedCount: count });
    }

    try {
        const [result] = await pool.query(
            'UPDATE orders SET cleared_at = NOW() WHERE table_number = ? AND cleared_at IS NULL',
            [tableNumber]
        );
        broadcast({ type: 'table_cleared', tableNumber, clearedCount: result.affectedRows });
        res.json({ success: true, clearedCount: result.affectedRows });
    } catch (error) {
        console.error('Error clearing table:', error);
        res.status(500).json({ error: 'Failed to clear table' });
    }
});

// Delete completed orders
app.delete('/api/orders/completed/all', async (req, res) => {
    if (!USE_DATABASE) {
        // Use in-memory storage
        const completedCount = memoryOrders.filter(o => o.status === 'completed').length;
        memoryOrders = memoryOrders.filter(o => o.status !== 'completed');
        
        broadcast({
            type: 'completed_orders_cleared',
            count: completedCount
        });
        
        return res.json({ success: true, deletedCount: completedCount });
    }
    
    try {
        const [result] = await pool.query('DELETE FROM orders WHERE status = ?', ['completed']);
        
        broadcast({
            type: 'completed_orders_cleared',
            count: result.affectedRows
        });
        
        res.json({ success: true, deletedCount: result.affectedRows });
    } catch (error) {
        console.error('Error deleting completed orders:', error);
        res.status(500).json({ error: 'Failed to delete completed orders' });
    }
});

// Get statistics
app.get('/api/statistics', async (req, res) => {
    if (!USE_DATABASE) {
        // Use in-memory storage
        const stats = {
            total_orders: memoryOrders.length,
            pending_orders: memoryOrders.filter(o => o.status === 'pending').length,
            cooking_orders: memoryOrders.filter(o => o.status === 'cooking').length,
            completed_orders: memoryOrders.filter(o => o.status === 'completed').length,
            total_revenue: memoryOrders.reduce((sum, o) => sum + parseFloat(o.total), 0)
        };
        
        return res.json(stats);
    }
    
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                SUM(CASE WHEN status = 'cooking' THEN 1 ELSE 0 END) as cooking_orders,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                SUM(total) as total_revenue
            FROM orders
            WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+09:00')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+09:00'))
        `);
        
        res.json(stats[0]);
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Sales trend statistics (daily / weekly / monthly, KST)
app.get('/api/sales-stats', async (req, res) => {
    const period = (req.query.period || 'daily').toLowerCase();

    const kstLabel = (d, p) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        if (p === 'monthly') return `${y}-${m}`;
        if (p === 'weekly') {
            const tmp = new Date(Date.UTC(y, d.getMonth(), d.getDate()));
            const dayNum = tmp.getUTCDay() || 7;
            tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
            const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
            return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
        }
        return `${y}-${m}-${day}`;
    };

    if (!USE_DATABASE) {
        const now = Date.now();
        const windowMs = period === 'monthly' ? 365 * 86400000
            : period === 'weekly' ? 84 * 86400000
            : 30 * 86400000;
        const cutoff = now - windowMs;
        const buckets = new Map();
        memoryOrders.forEach(o => {
            const t = new Date(o.created_at).getTime();
            if (t < cutoff) return;
            const kst = new Date(t + 9 * 3600 * 1000);
            const label = kstLabel(kst, period);
            const cur = buckets.get(label) || { label, count: 0, revenue: 0 };
            cur.count += 1;
            cur.revenue += parseFloat(o.total) || 0;
            buckets.set(label, cur);
        });
        const result = [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
        return res.json(result);
    }

    try {
        let groupExpr, rangeExpr;
        if (period === 'monthly') {
            groupExpr = "DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+09:00'), '%Y-%m')";
            rangeExpr = 'created_at >= UTC_TIMESTAMP() - INTERVAL 12 MONTH';
        } else if (period === 'weekly') {
            groupExpr = "DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+09:00'), '%x-W%v')";
            rangeExpr = 'created_at >= UTC_TIMESTAMP() - INTERVAL 12 WEEK';
        } else {
            groupExpr = "DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+09:00'), '%Y-%m-%d')";
            rangeExpr = 'created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY';
        }

        const sql = `
            SELECT ${groupExpr} AS label,
                   COUNT(*) AS count,
                   COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE ${rangeExpr}
            GROUP BY label
            ORDER BY label ASC
        `;
        const [rows] = await pool.query(sql);
        res.json(rows.map(r => ({
            label: r.label,
            count: Number(r.count),
            revenue: Number(r.revenue)
        })));
    } catch (error) {
        console.error('Error fetching sales stats:', error);
        res.status(500).json({ error: 'Failed to fetch sales stats', details: error.message });
    }
});

// Hourly peak-time analysis (KST hour-of-day)
app.get('/api/sales-stats/hourly', async (req, res) => {
    const period = (req.query.period || 'daily').toLowerCase();
    const days = period === 'monthly' ? 365 : period === 'weekly' ? 84 : 30;

    const empty = () => Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, revenue: 0 }));

    if (!USE_DATABASE) {
        const cutoff = Date.now() - days * 86400000;
        const buckets = empty();
        memoryOrders.forEach(o => {
            const t = new Date(o.created_at).getTime();
            if (t < cutoff) return;
            const kstHour = new Date(t + 9 * 3600 * 1000).getUTCHours();
            buckets[kstHour].count += 1;
            buckets[kstHour].revenue += parseFloat(o.total) || 0;
        });
        return res.json(buckets);
    }

    try {
        const sql = `
            SELECT HOUR(CONVERT_TZ(created_at, '+00:00', '+09:00')) AS hour,
                   COUNT(*) AS count,
                   COALESCE(SUM(total), 0) AS revenue
            FROM orders
            WHERE created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
            GROUP BY hour
            ORDER BY hour ASC
        `;
        const [rows] = await pool.query(sql, [days]);
        const buckets = empty();
        rows.forEach(r => {
            buckets[Number(r.hour)] = {
                hour: Number(r.hour),
                count: Number(r.count),
                revenue: Number(r.revenue)
            };
        });
        res.json(buckets);
    } catch (error) {
        console.error('Error fetching hourly stats:', error);
        res.status(500).json({ error: 'Failed to fetch hourly stats', details: error.message });
    }
});

// Staff call endpoints
app.get('/api/staff-calls', async (req, res) => {
    if (!USE_DATABASE) {
        return res.json(staffCalls);
    }
    
    try {
        const [calls] = await pool.query(
            'SELECT * FROM staff_calls WHERE status = ? ORDER BY created_at DESC',
            ['pending']
        );
        res.json(calls);
    } catch (error) {
        console.error('Error fetching staff calls:', error);
        res.status(500).json({ error: 'Failed to fetch staff calls' });
    }
});

app.post('/api/staff-calls', async (req, res) => {
    const { tableNumber, message } = req.body;
    
    if (!USE_DATABASE) {
        const newCall = {
            id: 'call_' + Date.now(),
            table_number: tableNumber,
            message,
            status: 'pending',
            created_at: new Date().toISOString()
        };
        
        staffCalls.unshift(newCall);
        
        // Broadcast to admin
        broadcast({
            type: 'staff_call',
            call: newCall
        });
        
        return res.status(201).json({ success: true, callId: newCall.id });
    }
    
    try {
        const callId = 'call_' + Date.now();
        
        await pool.query(
            'INSERT INTO staff_calls (id, table_number, message, status) VALUES (?, ?, ?, ?)',
            [callId, tableNumber, message, 'pending']
        );
        
        // Broadcast to admin
        broadcast({
            type: 'staff_call',
            call: {
                id: callId,
                table_number: tableNumber,
                message,
                status: 'pending',
                created_at: new Date()
            }
        });
        
        res.status(201).json({ success: true, callId });
    } catch (error) {
        console.error('Error creating staff call:', error);
        res.status(500).json({ error: 'Failed to create staff call' });
    }
});

app.patch('/api/staff-calls/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!USE_DATABASE) {
        const call = staffCalls.find(c => c.id === id);
        if (!call) {
            return res.status(404).json({ error: 'Staff call not found' });
        }
        
        call.status = status;
        
        broadcast({
            type: 'staff_call_update',
            callId: id,
            status
        });
        
        return res.json({ success: true });
    }
    
    try {
        await pool.query(
            'UPDATE staff_calls SET status = ? WHERE id = ?',
            [status, id]
        );
        
        broadcast({
            type: 'staff_call_update',
            callId: id,
            status
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating staff call:', error);
        res.status(500).json({ error: 'Failed to update staff call' });
    }
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/admin', (req, res) => {
    res.sendFile(__dirname + '/admin.html');
});

app.get('/qr-generator', (req, res) => {
    res.sendFile(__dirname + '/qr-generator.html');
});

app.get('/menu-admin', (req, res) => {
    res.sendFile(__dirname + '/menu-admin.html');
});

app.get('/stats', (req, res) => {
    res.sendFile(__dirname + '/stats.html');
});

app.get('/staff-order', (req, res) => {
    res.sendFile(__dirname + '/staff-order.html');
});

// Initialize and start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    if (USE_DATABASE) {
        console.log('🔌 Connecting to MySQL database...');
        try {
            await testConnection();
            await initializeDatabase();
            console.log('✅ Database connected and initialized');
        } catch (error) {
            // DB 연결 실패 시 메모리 모드로 fallback — 서버는 계속 시작
            console.error('⚠️  DB connection failed, running in memory mode:', error.message);
            USE_DATABASE = false;
        }
    } else {
        console.log('⚠️  Running without database (memory mode)');
    }

    // DB 성공 여부와 무관하게 서버 시작
    server.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📱 Customer app: http://localhost:${PORT}/`);
        console.log(`🏪 Admin app: http://localhost:${PORT}/admin`);
        console.log(`📱 QR Generator: http://localhost:${PORT}/qr-generator`);
    });
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        if (USE_DATABASE && pool) {
            pool.end();
        }
        process.exit(0);
    });
});

// Made with Bob
